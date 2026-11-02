import { attachPcmCapture, type AudioSource } from "./pcmCapture";

export type AudioCaptureState = {
  status: "idle" | "starting" | "listening" | "paused" | "stopped" | "error";
  sharedLevel: number;
  microphoneLevel: number;
  surface: string;
  error: string;
};

export const initialAudioState: AudioCaptureState = {
  status: "idle",
  sharedLevel: 0,
  microphoneLevel: 0,
  surface: "",
  error: "",
};

type Session = {
  streams: MediaStream[];
  context?: AudioContext;
  timer?: ReturnType<typeof setInterval>;
  cleanups: (() => void)[];
};

function release(session: Session) {
  clearInterval(session.timer);
  for (const cleanup of session.cleanups.splice(0)) cleanup();
  for (const stream of session.streams.splice(0)) {
    for (const track of stream.getTracks()) track.stop();
  }
  if (session.context) void session.context.close().catch(() => {});
  session.context = undefined;
}

export class BrowserAudio {
  private session?: Session;
  private disposed = false;
  constructor(
    private readonly update: (state: AudioCaptureState) => void,
    private readonly onChunk?: (
      source: AudioSource,
      samples: Float32Array,
      endedAtPause: boolean,
    ) => void,
  ) {}

  stop(status: "paused" | "stopped" = "stopped") {
    const previous = this.session;
    this.session = undefined;
    if (previous) release(previous);
    if (!this.disposed) this.update({ ...initialAudioState, status });
  }

  dispose() {
    this.disposed = true;
    this.stop();
  }

  async start() {
    if (this.disposed || this.session) return;
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getDisplayMedia ||
      !navigator.mediaDevices.getUserMedia ||
      !window.AudioContext
    ) {
      this.update({
        ...initialAudioState,
        status: "error",
        error:
          "Audio sharing is unavailable here. Open Panky over HTTPS or localhost in a browser that supports sharing audio.",
      });
      return;
    }
    const session: Session = { streams: [], cleanups: [] };
    this.session = session;
    const current = () => !this.disposed && this.session === session;
    this.update({ ...initialAudioState, status: "starting" });
    try {
      const options: DisplayMediaStreamOptions & { systemAudio: string } = {
        video: true,
        audio: true,
        systemAudio: "include",
      };
      const shared = await navigator.mediaDevices.getDisplayMedia(options);
      session.streams.push(shared);
      if (!current()) return release(session);
      if (
        !shared.getAudioTracks().some((track) => track.readyState === "live")
      ) {
        throw new Error(
          "No shared audio was supplied. Select a tab, window or screen with Share audio enabled. If that option is missing, this browser cannot capture that source; try a browser tab containing the call.",
        );
      }
      for (const track of shared.getTracks()) {
        track.addEventListener(
          "ended",
          () => {
            if (current()) this.stop();
          },
          { once: true },
        );
      }
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      session.streams.push(microphone);
      if (!current()) return release(session);
      if (
        !microphone
          .getAudioTracks()
          .some((track) => track.readyState === "live")
      ) {
        throw new Error(
          "No microphone audio was supplied. Check your input device and try again.",
        );
      }
      for (const track of microphone.getTracks()) {
        track.addEventListener(
          "ended",
          () => {
            if (current()) this.stop();
          },
          { once: true },
        );
      }
      const context = new AudioContext();
      session.context = context;
      const meter = (stream: MediaStream) => {
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context
          .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
          .connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        return () => {
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(
            samples.reduce((sum, value) => sum + value * value, 0) /
              samples.length,
          );
          return Math.min(100, rms * 500);
        };
      };
      if (this.onChunk) {
        await context.audioWorklet.addModule(
          new URL("./capture.worklet.js", import.meta.url),
        );
        if (!current()) return release(session);
        const fail = (error: string) => {
          if (!current()) return;
          this.session = undefined;
          release(session);
          this.update({ ...initialAudioState, status: "error", error });
        };
        for (const [source, stream] of [
          ["shared", shared],
          ["microphone", microphone],
        ] as const) {
          session.cleanups.push(
            attachPcmCapture(
              context,
              stream,
              (samples, endedAtPause) => {
                if (current()) this.onChunk?.(source, samples, endedAtPause);
              },
              fail,
            ),
          );
        }
      }
      const sharedLevel = meter(shared);
      const microphoneLevel = meter(microphone);
      await context.resume();
      if (!current()) return release(session);
      const surface =
        shared.getVideoTracks()[0]?.getSettings().displaySurface ??
        "shared source";
      const report = () => {
        if (current())
          this.update({
            status: "listening",
            sharedLevel: sharedLevel(),
            microphoneLevel: microphoneLevel(),
            surface,
            error: "",
          });
      };
      report();
      session.timer = setInterval(report, 100);
    } catch (cause) {
      if (!current()) return release(session);
      this.session = undefined;
      release(session);
      this.update({
        ...initialAudioState,
        status: "error",
        error:
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Sharing was cancelled or permission was denied. No audio is being captured. Press Start listening to try again."
            : cause instanceof Error
              ? cause.message
              : "Audio capture failed. Check browser permissions and try again.",
      });
    }
  }
}
