import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import wasmFactoryUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import {
  SPEECH_CACHE,
  SPEECH_MODEL,
  SPEECH_REVISION,
  type TranscriptionRequest,
  type TranscriptionResponse,
} from "./transcriptionProtocol";

let transcriber: AutomaticSpeechRecognitionPipeline | undefined;
let busy = false;
const send = (message: TranscriptionResponse) => self.postMessage(message);

async function load() {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useFS = false;
  env.useFSCache = false;
  env.useBrowserCache = false;
  env.cacheKey = SPEECH_CACHE;
  env.useCustomCache = typeof caches !== "undefined";
  env.customCache = env.useCustomCache ? await caches.open(SPEECH_CACHE) : null;
  env.useWasmCache = env.useCustomCache;
  env.experimental_useCrossOriginStorage = false;
  const wasm = env.backends.onnx.wasm;
  if (!wasm)
    throw new Error("WebAssembly speech recognition is not supported.");
  wasm.numThreads = 1;
  wasm.proxy = false;
  wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmFactoryUrl };
  transcriber = await pipeline("automatic-speech-recognition", SPEECH_MODEL, {
    revision: SPEECH_REVISION,
    device: "wasm",
    dtype: "q8",
    progress_callback: (progress) => {
      if (progress.status === "progress_total") {
        send({
          type: "progress",
          text: `Loading speech model: ${Math.round(progress.loaded / 1_000_000)} MB / ${Math.round(progress.total / 1_000_000)} MB`,
        });
      } else if (progress.status === "progress") {
        send({
          type: "progress",
          text: `${progress.file}: ${Math.round(progress.progress)}%`,
        });
      } else if (progress.status === "done") {
        send({
          type: "progress",
          text: "Preparing speech model in this browser…",
        });
      }
    },
  });
  send({ type: "ready" });
}

function validRequest(value: unknown): value is TranscriptionRequest {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "load") return true;
  return (
    value.type === "transcribe" &&
    "id" in value &&
    Number.isSafeInteger(value.id) &&
    "source" in value &&
    (value.source === "shared" || value.source === "microphone") &&
    "samples" in value &&
    value.samples instanceof Float32Array &&
    value.samples.length > 0 &&
    value.samples.length <= 160_000 &&
    value.samples.every(Number.isFinite)
  );
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  if (!validRequest(event.data) || busy) {
    send({ type: "error", error: "Invalid or overlapping speech request." });
    return;
  }
  busy = true;
  try {
    const request = event.data;
    if (request.type === "load") {
      if (!transcriber) await load();
      else send({ type: "ready" });
    } else {
      if (!transcriber)
        throw new Error("Load the speech model before transcribing audio.");
      const started = performance.now();
      const energy =
        request.samples.reduce((sum, value) => sum + value * value, 0) /
        request.samples.length;
      const result =
        energy < 0.000001
          ? { text: "" }
          : await transcriber(request.samples, {
              max_new_tokens: 128,
              return_timestamps: false,
              do_sample: false,
            });
      send({
        type: "result",
        id: request.id,
        source: request.source,
        text: result.text.trim().slice(0, 4000),
        elapsedMs: performance.now() - started,
      });
    }
  } catch (cause) {
    send({
      type: "error",
      error:
        cause instanceof Error
          ? cause.message.slice(0, 500)
          : "Local speech recognition failed.",
    });
  } finally {
    busy = false;
  }
};
