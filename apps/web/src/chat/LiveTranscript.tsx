import { BannerToast, Button } from "@jack.winter/pancake-ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AudioSourceStatus } from "./AudioSourceStatus";
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

export function LiveTranscript({
  children,
  onTranscript,
  onUseAsQuestion,
  onResetDetection,
}: {
  children?: ReactNode;
  onTranscript?: (entry: TranscriptEntry) => void;
  onUseAsQuestion?: (text: string) => void;
  onResetDetection?: () => void;
}) {
  const transcriptCallback = useRef(onTranscript);
  transcriptCallback.current = onTranscript;
  const resetDetectionCallback = useRef(onResetDetection);
  resetDetectionCallback.current = onResetDetection;
  const [state, setState] = useState(initialAudioState);
  const [speech, setSpeech] = useState(initialTranscriptionState);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [removing, setRemoving] = useState(false);
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
  const active = state.status === "listening";
  const pending = state.status === "starting";
  const loading = speech.status === "loading";
  const modelReady =
    speech.status === "ready" || speech.status === "transcribing";
  const hasSession = active || pending || loading || entries.length > 0;
  return (
    <section
      className={`live-transcript${hasSession ? " live-transcript-active" : ""}`}
      aria-label="Browser audio capture"
    >
      <div className="welcome listening-welcome">
        <h2>
          {active
            ? "Listening"
            : entries.length
              ? "Your transcript"
              : "Start listening"}
        </h2>
        {!hasSession && (
          <p className="muted">
            Choose your Google Meet tab and share its audio.
          </p>
        )}
        {(state.status !== "idle" || loading) && (
          <p role="status" className="listening-status">
            {loading
              ? speech.progress || "Preparing local transcription…"
              : {
                  idle: "Ready to listen",
                  starting: "Waiting for sharing and microphone permission",
                  listening: "Listening in this browser",
                  paused: "Paused — audio released",
                  stopped: "Stopped — audio released",
                  error: "Not listening",
                }[state.status]}
          </p>
        )}
        <div className="browser-audio-actions listening-controls">
          {!active && !pending && !loading && (
            <Button disabled={removing} onClick={() => void start()}>
              Start listening
            </Button>
          )}
          {active && !loading && (
            <Button
              variant="secondary"
              onClick={() => capture.current?.stop("paused")}
            >
              Pause
            </Button>
          )}
          {(active || pending) && (
            <Button variant="secondary" onClick={() => capture.current?.stop()}>
              Stop
            </Button>
          )}
          {loading && !active && !pending && (
            <Button
              variant="secondary"
              onClick={() => transcriber.current?.stop()}
            >
              Cancel model load
            </Button>
          )}
        </div>
        {!hasSession && !modelReady && (
          <p className="interview-note listening-download">
            Transcribes on your device. First use downloads about 70 MB.
          </p>
        )}
      </div>
      {speech.error && (
        <BannerToast tone="error" title="Transcription unavailable">
          {speech.error}
        </BannerToast>
      )}
      {state.error && (
        <BannerToast tone="error" title="Audio capture unavailable">
          {state.error}
        </BannerToast>
      )}
      <AudioSourceStatus state={state} />
      {children}
      {(active || entries.length > 0) && (
        <details className="transcript-details">
          <summary>Transcript ({entries.length})</summary>
          <section aria-label="Live transcript" className="transcript-entries">
            {entries.length > 0 && (
              <div className="transcript-toolbar">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEntries([]);
                    resetDetectionCallback.current?.();
                  }}
                >
                  Clear transcript
                </Button>
              </div>
            )}
            {entries.length === 0 ? (
              <p className="muted">
                {loading
                  ? "Transcripts will begin when the model is ready."
                  : "No transcript yet. Listening for speech…"}
              </p>
            ) : (
              entries.map((entry) => (
                <article key={entry.id}>
                  <p className="transcript-source">
                    {entry.source === "shared" ? "Shared audio" : "Microphone"}
                  </p>
                  <p>{entry.text}</p>
                  {entry.source === "shared" && onUseAsQuestion && (
                    <Button
                      variant="ghost"
                      onClick={() => onUseAsQuestion(entry.text)}
                    >
                      Use as question
                    </Button>
                  )}
                </article>
              ))
            )}
          </section>
        </details>
      )}
      <details className="listening-settings">
        <summary>Listening settings</summary>
        <section aria-label="Local speech model" className="speech-model">
          <p>
            English transcription runs locally. The first use downloads about 70
            MB from Hugging Face and this app, then caches it in your browser.
            You can load it before your call.
          </p>
          <div className="browser-audio-actions">
            <Button
              variant="secondary"
              disabled={active || pending || loading || modelReady || removing}
              onClick={() => void transcriber.current?.load()}
            >
              Load speech model
            </Button>
            <Button
              variant="ghost"
              disabled={active || pending || removing}
              onClick={async () => {
                setRemoving(true);
                try {
                  await transcriber.current?.clearCache();
                } finally {
                  setRemoving(false);
                }
              }}
            >
              Remove downloaded model
            </Button>
          </div>
          <p role="status">
            {removing
              ? "Removing downloaded model…"
              : speech.progress ||
                (modelReady ? "Speech model ready" : "Speech model not loaded")}
          </p>
        </section>
        <div className="browser-audio-meters">
          <label>
            Shared audio{" "}
            <meter
              aria-label="Shared audio level"
              min={0}
              max={100}
              value={state.sharedLevel}
            />
          </label>
          <label>
            Microphone{" "}
            <meter
              aria-label="Microphone level"
              min={0}
              max={100}
              value={state.microphoneLevel}
            />
          </label>
        </div>
        <p className="interview-note">
          Use headphones. Enable Share audio in the browser picker and allow
          microphone access. {active && `Selected source: ${state.surface}. `}A
          silent meter does not confirm audio capture.
        </p>
        <p className="interview-note">
          Audio and unsent transcripts stay on this device. Up to 50 transcript
          segments remain until cleared or you leave Interview. Pause and Stop
          discard pending audio and transcription; Start asks you to choose a
          source again. Dismiss any permission prompt left open after Stop.
          Shared speech can suggest editable questions. Only Use this question
          sends a question to the model; microphone speech is never submitted.
        </p>
      </details>
    </section>
  );
}
