import {
  SPEECH_CACHE,
  type AudioSource,
  type TranscriptionRequest,
  isTranscriptionResponse,
} from "./transcriptionProtocol";

export type TranscriptionState = {
  status: "idle" | "loading" | "ready" | "transcribing" | "error";
  progress: string;
  error: string;
};
export const initialTranscriptionState: TranscriptionState = {
  status: "idle",
  progress: "",
  error: "",
};
type Job = {
  id: number;
  source: AudioSource;
  samples: Float32Array;
  endedAtPause: boolean;
};

export class BrowserTranscription {
  private worker?: Worker;
  private ready = false;
  private queue: Job[] = [];
  private active?: Job;
  private timer?: ReturnType<typeof setTimeout>;
  private finishLoad?: () => void;
  private nextId = 0;
  private disposed = false;
  private clearing = false;

  constructor(
    private readonly update: (state: TranscriptionState) => void,
    private readonly onResult: (
      source: AudioSource,
      text: string,
      elapsedMs: number,
      endedAtPause: boolean,
    ) => void,
    private readonly onFatal: () => void,
  ) {}

  async load(): Promise<void> {
    if (this.disposed || this.worker || this.clearing) return;
    this.update({
      status: "loading",
      progress: "Loading local speech model…",
      error: "",
    });
    const finished = new Promise<void>((resolve) => {
      this.finishLoad = resolve;
    });
    try {
      const worker = new Worker(
        new URL("./transcription.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (this.worker !== worker || this.disposed) return;
        if (!isTranscriptionResponse(event.data)) {
          this.fail(
            "The speech worker returned an invalid response. Load the model again.",
          );
          return;
        }
        const message = event.data;
        if (message.type === "progress" && !this.ready) {
          this.update({
            status: "loading",
            progress: message.text.slice(0, 200),
            error: "",
          });
        } else if (message.type === "ready" && !this.ready) {
          clearTimeout(this.timer);
          this.ready = true;
          this.finishLoad?.();
          this.finishLoad = undefined;
          this.update({
            status: "ready",
            progress: "Speech model ready",
            error: "",
          });
        } else if (message.type === "result") {
          const active = this.active;
          if (
            !active ||
            message.id !== active.id ||
            message.source !== active.source
          ) {
            this.fail(
              "The speech worker returned an unexpected result. Load the model again.",
            );
            return;
          }
          clearTimeout(this.timer);
          this.active = undefined;
          if (message.text.trim())
            this.onResult(
              message.source,
              message.text.slice(0, 4000),
              message.elapsedMs,
              active.endedAtPause,
            );
          if (this.worker !== worker) return;
          this.drain();
        } else if (message.type === "error") {
          this.fail(message.error);
        }
      };
      worker.onerror = () => {
        if (this.worker === worker)
          this.fail("The speech worker failed. Load the model again to retry.");
      };
      worker.onmessageerror = () => {
        if (this.worker === worker)
          this.fail(
            "The speech worker could not read audio. Load the model again.",
          );
      };
      this.timer = setTimeout(
        () =>
          this.fail(
            "The speech model took too long to load. Check your connection and retry.",
          ),
        120_000,
      );
      const request: TranscriptionRequest = { type: "load" };
      worker.postMessage(request);
    } catch {
      this.fail("This browser could not start local speech recognition.");
    }
    await finished;
  }

  submit(source: AudioSource, samples: Float32Array, endedAtPause = false) {
    if (!this.ready || !this.worker || this.disposed) return;
    if (
      samples.length === 0 ||
      samples.length > 160_000 ||
      !samples.every(Number.isFinite)
    ) {
      this.fail(
        "Audio could not be processed safely. Start again with a supported audio source.",
      );
      return;
    }
    const energy =
      samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
    if (energy < 0.000001) return;
    if (this.queue.length >= 2) {
      this.fail(
        "Transcription cannot keep up with incoming audio. Listening stopped; pending audio was discarded.",
      );
      return;
    }
    this.queue.push({
      id: ++this.nextId,
      source,
      samples: samples.slice(),
      endedAtPause,
    });
    this.drain();
  }

  private drain() {
    if (this.active || !this.worker || !this.ready) return;
    const job = this.queue.shift();
    if (!job) {
      this.update({
        status: "ready",
        progress: "Speech model ready",
        error: "",
      });
      return;
    }
    this.active = job;
    this.update({
      status: "transcribing",
      progress: `Transcribing ${job.source === "shared" ? "shared audio" : "microphone"} locally…`,
      error: "",
    });
    const request: TranscriptionRequest = { type: "transcribe", ...job };
    try {
      this.worker.postMessage(request, [job.samples.buffer]);
      this.timer = setTimeout(
        () =>
          this.fail(
            "Transcription took too long. Listening stopped and pending audio was discarded.",
          ),
        60_000,
      );
    } catch {
      this.fail("Audio could not be delivered to the speech worker.");
    }
  }

  private reset() {
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = false;
    clearTimeout(this.timer);
    this.queue = [];
    this.active = undefined;
    this.finishLoad?.();
    this.finishLoad = undefined;
  }

  private fail(error: string) {
    this.reset();
    if (this.disposed) return;
    this.onFatal();
    this.update({ status: "error", progress: "", error: error.slice(0, 500) });
  }

  stop() {
    this.reset();
    if (!this.disposed) this.update({ ...initialTranscriptionState });
  }

  dispose() {
    this.disposed = true;
    this.reset();
  }

  async clearCache() {
    this.stop();
    this.clearing = true;
    try {
      if (typeof caches !== "undefined") await caches.delete(SPEECH_CACHE);
      if (!this.disposed)
        this.update({
          ...initialTranscriptionState,
          progress: "Downloaded speech model removed",
        });
    } catch {
      if (!this.disposed)
        this.update({
          status: "error",
          progress: "",
          error:
            "The browser could not remove its speech-model cache. Try again or clear this site's storage in browser settings.",
        });
    } finally {
      this.clearing = false;
    }
  }
}
