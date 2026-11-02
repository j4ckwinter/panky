import { expect, type Page } from "@playwright/test";
import { login } from "./auth-fixture.js";

export async function audioFixture(
  page: Page,
  mode = "success",
  speechMode = "success",
) {
  await speechFixture(page, speechMode);
  await page.addInitScript((initialMode) => {
    let mode = initialMode;
    let resolveDisplay: ((stream: MediaStream) => void) | undefined;
    let resolveMicrophone: ((stream: MediaStream) => void) | undefined;
    const tracks: MediaStreamTrack[] = [];
    let displayCalls = 0;
    let microphoneCalls = 0;
    function audio() {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.1;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      void context.resume();
      const track = destination.stream.getAudioTracks()[0]!;
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        oscillator.stop();
        void context.close().catch(() => {});
      };
      return track;
    }
    function shared() {
      const canvas = document.createElement("canvas");
      const video = canvas.captureStream(1).getVideoTracks()[0]!;
      const stream = new MediaStream([video]);
      if (mode !== "no-audio") stream.addTrack(audio());
      tracks.push(...stream.getTracks());
      return stream;
    }
    function microphone() {
      const stream = new MediaStream([audio()]);
      tracks.push(...stream.getTracks());
      return stream;
    }
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: () => {
        displayCalls++;
        if (mode === "denied")
          return Promise.reject(new DOMException("Denied", "NotAllowedError"));
        if (mode === "pending-display")
          return new Promise<MediaStream>((resolve) => {
            resolveDisplay = resolve;
          });
        return Promise.resolve(shared());
      },
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => {
        microphoneCalls++;
        if (mode === "denied-mic")
          return Promise.reject(new DOMException("Denied", "NotAllowedError"));
        if (mode === "pending-mic")
          return new Promise<MediaStream>((resolve) => {
            resolveMicrophone = resolve;
          });
        return Promise.resolve(microphone());
      },
    });
    Object.assign(window, {
      audioTest: {
        snapshot: () => ({
          displayCalls,
          microphoneCalls,
          live: tracks.filter((track) => track.readyState === "live").length,
        }),
        mode: (value: string) => {
          mode = value;
        },
        resolveDisplay: () => resolveDisplay?.(shared()),
        resolveMicrophone: () => resolveMicrophone?.(microphone()),
        end: () => {
          tracks[0]?.dispatchEvent(new Event("ended"));
        },
      },
    });
  }, mode);
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  return page.getByRole("region", { name: "Browser audio capture" });
}

export async function expectReleased(page: Page) {
  await expect
    .poll(() => page.evaluate("window.audioTest.snapshot().live"))
    .toBe(0);
}

async function speechFixture(page: Page, mode = "success") {
  await page.addInitScript((mode) => {
    const OriginalWorker = window.Worker;
    const workers: FakeWorker[] = [];
    let loads = 0;
    const transcripts: Record<string, string> = {};
    class FakeWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      onmessageerror: (() => void) | null = null;
      terminated = false;
      postMessage(message: { type: string; id: number; source: string }) {
        if (message.type === "load") {
          loads++;
          if (mode === "pending-load") return;
          setTimeout(
            () =>
              this.onmessage?.({
                data:
                  mode === "load-error"
                    ? {
                        type: "error",
                        error: "Controlled model download failure",
                      }
                    : { type: "ready" },
              }),
            10,
          );
        } else if (mode !== "hold") {
          setTimeout(
            () =>
              this.onmessage?.({
                data: {
                  type: "result",
                  id: message.id,
                  source: message.source,
                  text:
                    transcripts[message.source] ??
                    `${message.source} controlled transcript`,
                  elapsedMs: 42,
                },
              }),
            10,
          );
        }
      }
      terminate() {
        this.terminated = true;
      }
    }
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes("transcription.worker")) {
          const worker = new FakeWorker();
          workers.push(worker);
          return worker as unknown as Worker;
        }
        super(url, options);
      }
    };
    Object.assign(window, {
      speechTest: {
        transcript: (source: string, text: string) => {
          transcripts[source] = text;
        },
        loads: () => loads,
        ready: () => workers[0]?.onmessage?.({ data: { type: "ready" } }),
        terminated: () => workers.every((worker) => worker.terminated),
        late: () =>
          workers[0]?.onmessage?.({
            data: {
              type: "result",
              id: 1,
              source: "shared",
              text: "late forbidden result",
              elapsedMs: 1,
            },
          }),
      },
    });
  }, mode);
}
