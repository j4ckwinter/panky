import { useEffect, useRef, useState } from "react";
import { BrowserAudio, initialAudioState } from "./browserAudio";
import {
  BrowserTranscription,
  initialTranscriptionState,
} from "./transcription";

export type TranscriptEntry = {
  id: number;
  source: "shared" | "microphone";
  text: string;
  receivedAt: number;
  transcriptionMs: number;
  endedAtPause: boolean;
};

export function useLiveTranscription({
  onTranscript,
  onResetDetection,
}: {
  onTranscript?: (entry: TranscriptEntry) => void;
  onResetDetection?: () => void;
}) {
  const transcriptCallback = useRef(onTranscript);
  transcriptCallback.current = onTranscript;
  const resetDetectionCallback = useRef(onResetDetection);
  resetDetectionCallback.current = onResetDetection;
  const [state, setState] = useState(initialAudioState);
  const [speech, setSpeech] = useState(initialTranscriptionState);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const capture = useRef<BrowserAudio | null>(null);
  const transcriber = useRef<BrowserTranscription | null>(null);
  const captureStatus = useRef(initialAudioState.status);
  const speechStatus = useRef(initialTranscriptionState.status);
  const attempt = useRef(0);
  const nextId = useRef(0);
  useEffect(() => {
    let mounted = true;
    const model = new BrowserTranscription(
      (value) => {
        speechStatus.current = value.status;
        if (mounted) setSpeech(value);
      },
      (source, text, transcriptionMs, endedAtPause) => {
        if (mounted && text.trim()) {
          const entry = {
            id: nextId.current++,
            source,
            text,
            transcriptionMs,
            endedAtPause,
            receivedAt: performance.now(),
          };
          setEntries((items) => [...items, entry].slice(-50));
          transcriptCallback.current?.(entry);
        }
      },
      () => controller.stop(),
    );
    const controller = new BrowserAudio(
      (value) => {
        captureStatus.current = value.status;
        if (mounted) setState(value);
        if (["stopped", "paused", "error"].includes(value.status)) {
          resetDetectionCallback.current?.();
          attempt.current++;
          if (speechStatus.current !== "error") model.stop();
        }
      },
      (source, samples, endedAtPause) => {
        if (["ready", "transcribing"].includes(speechStatus.current))
          model.submit(source, samples, endedAtPause);
      },
    );
    capture.current = controller;
    transcriber.current = model;
    const stop = () => {
      controller.stop();
      model.stop();
    };
    window.addEventListener("pagehide", stop);
    return () => {
      mounted = false;
      attempt.current++;
      window.removeEventListener("pagehide", stop);
      controller.dispose();
      model.dispose();
      capture.current = null;
      transcriber.current = null;
    };
  }, []);
  async function start() {
    const controller = capture.current;
    const model = transcriber.current;
    if (
      !controller ||
      !model ||
      ["starting", "listening"].includes(captureStatus.current)
    )
      return;
    const current = ++attempt.current;
    await controller.start();
    if (
      current === attempt.current &&
      capture.current === controller &&
      captureStatus.current === "listening" &&
      !["ready", "transcribing"].includes(speechStatus.current)
    )
      await model.load();
  }
  function clearTranscript() {
    setEntries([]);
    resetDetectionCallback.current?.();
  }
  return {
    state,
    speech,
    entries,
    start,
    pause: () => capture.current?.stop("paused"),
    stop: () => capture.current?.stop(),
    clearTranscript,
  };
}
