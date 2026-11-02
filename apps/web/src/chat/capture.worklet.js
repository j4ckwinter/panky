class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.remaining = this.ratio;
    this.sum = 0;
    this.buffer = new Float32Array(80000);
    this.offset = 0;
    this.voiced = false;
    this.quietSamples = 0;
    this.windowEnergy = 0;
    this.windowSamples = 0;
    this.pending = false;
    this.failed = false;
    this.port.onmessage = (event) => {
      if (event.data === "received") this.pending = false;
    };
  }

  emit(endedAtPause) {
    if (this.pending) {
      this.port.postMessage({ type: "overflow" });
      this.failed = true;
      return false;
    }
    this.pending = true;
    const samples =
      this.offset === this.buffer.length
        ? this.buffer
        : this.buffer.slice(0, this.offset);
    this.port.postMessage({ type: "samples", samples, endedAtPause }, [
      samples.buffer,
    ]);
    this.buffer = new Float32Array(80000);
    this.offset = 0;
    this.voiced = false;
    this.quietSamples = 0;
    return true;
  }

  process(inputs) {
    if (this.failed) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let frame = 0; frame < channels[0].length; frame++) {
      let value = 0;
      for (const channel of channels) value += channel[frame];
      value /= channels.length;
      let available = 1;
      while (available > 1e-8) {
        const weight = Math.min(available, this.remaining);
        this.sum += value * weight;
        this.remaining -= weight;
        available -= weight;
        if (this.remaining < 1e-8) {
          const sample = this.sum / this.ratio;
          this.buffer[this.offset++] = sample;
          this.windowEnergy += sample * sample;
          this.windowSamples++;
          this.sum = 0;
          this.remaining = this.ratio;
          if (this.windowSamples === 160) {
            if (this.windowEnergy / 160 >= 0.000004) {
              this.voiced = true;
              this.quietSamples = 0;
            } else {
              this.quietSamples += 160;
            }
            this.windowEnergy = 0;
            this.windowSamples = 0;
          }
          const endedAtPause =
            this.voiced && this.offset >= 16000 && this.quietSamples >= 9600;
          if (
            (endedAtPause || this.offset === this.buffer.length) &&
            !this.emit(endedAtPause)
          )
            return false;
        }
      }
    }
    return true;
  }
}

registerProcessor("panky-pcm-capture", PcmCapture);
