export const SPEECH_CACHE = "panky-speech-model-v1";
export const SPEECH_MODEL = "Xenova/whisper-tiny.en";
export const SPEECH_REVISION = "79fb389fc764e7c395bd330e9531d9d32ada7049";
export type AudioSource = "shared" | "microphone";
export type TranscriptionRequest =
  | { type: "load" }
  | {
      type: "transcribe";
      id: number;
      source: AudioSource;
      samples: Float32Array;
    };
export type TranscriptionResponse =
  | { type: "progress"; text: string }
  | { type: "ready" }
  | {
      type: "result";
      id: number;
      source: AudioSource;
      text: string;
      elapsedMs: number;
    }
  | { type: "error"; error: string };

export function isTranscriptionResponse(
  value: unknown,
): value is TranscriptionResponse {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "ready") return true;
  if (value.type === "progress")
    return "text" in value && typeof value.text === "string";
  if (value.type === "error")
    return "error" in value && typeof value.error === "string";
  return (
    value.type === "result" &&
    "id" in value &&
    Number.isSafeInteger(value.id) &&
    "source" in value &&
    (value.source === "shared" || value.source === "microphone") &&
    "text" in value &&
    typeof value.text === "string" &&
    "elapsedMs" in value &&
    typeof value.elapsedMs === "number" &&
    Number.isFinite(value.elapsedMs) &&
    value.elapsedMs >= 0
  );
}
