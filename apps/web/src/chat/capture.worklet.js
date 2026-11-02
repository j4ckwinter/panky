class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.remaining = this.ratio;
    this.sum = 0;
    this.buffer = new Float32Array(80000);
    this.offset = 0;
    this.pending = false;
    this.failed = false;
    this.port.onmessage = (event) => {
      if (event.data === "received") this.pending = false;
    };
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
          this.buffer[this.offset++] = this.sum / this.ratio;
          this.sum = 0;
          this.remaining = this.ratio;
          if (this.offset === this.buffer.length) {
            if (this.pending) {
              this.port.postMessage({ type: "overflow" });
              this.failed = true;
              return false;
            }
            this.pending = true;
            this.port.postMessage({ type: "samples", samples: this.buffer }, [
              this.buffer.buffer,
            ]);
            this.buffer = new Float32Array(80000);
            this.offset = 0;
          }
        }
      }
    }
    return true;
  }
}

registerProcessor("panky-pcm-capture", PcmCapture);
