export type AudioSource = "shared" | "microphone";

export function attachPcmCapture(
  context: AudioContext,
  stream: MediaStream,
  onChunk: (samples: Float32Array) => void,
  onError: (message: string) => void,
) {
  const source = context.createMediaStreamSource(
    new MediaStream(stream.getAudioTracks()),
  );
  const processor = new AudioWorkletNode(context, "panky-pcm-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  let active = true;
  processor.onprocessorerror = () => {
    if (active) onError("Audio processing failed. Listening has stopped.");
  };
  processor.port.onmessage = (event: MessageEvent<unknown>) => {
    if (!active) return;
    const message = event.data;
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      message.type !== "samples" ||
      !("samples" in message) ||
      !(message.samples instanceof Float32Array) ||
      message.samples.length !== 80000
    ) {
      onError("Audio processing fell behind. Listening has stopped.");
      return;
    }
    try {
      onChunk(message.samples);
      if (active) processor.port.postMessage("received");
    } catch {
      onError("Audio processing failed. Listening has stopped.");
    }
  };
  source.connect(processor);
  processor.connect(context.destination);
  return () => {
    active = false;
    processor.port.onmessage = null;
    processor.onprocessorerror = null;
    processor.port.close();
    source.disconnect();
    processor.disconnect();
  };
}
