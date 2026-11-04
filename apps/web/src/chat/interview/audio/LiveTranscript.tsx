import { BannerToast, Button, StatusChip } from "@jack.winter/pancake-ui";
import type { ReactNode } from "react";
import { AudioSourceStatus } from "./AudioSourceStatus";
import {
  type TranscriptEntry,
  useLiveTranscription,
} from "./useLiveTranscription";

export function LiveTranscript({
  children,
  modelPicker,
  modelNotice,
  topicAction,
  onTranscript,
  onUseAsQuestion,
  onResetDetection,
}: {
  children?: ReactNode;
  modelPicker?: ReactNode;
  modelNotice?: ReactNode;
  topicAction?: ReactNode;
  onTranscript?: (entry: TranscriptEntry) => void;
  onUseAsQuestion?: (text: string) => void;
  onResetDetection?: () => void;
}) {
  const { state, speech, entries, start, pause, stop, clearTranscript } =
    useLiveTranscription({ onTranscript, onResetDetection });
  const active = state.status === "listening";
  const pending = state.status === "starting";
  const loading = speech.status === "loading";
  const hasSession = active || pending || loading || entries.length > 0;
  return (
    <section
      className={`live-transcript${hasSession ? " live-transcript-active" : ""}`}
      aria-label="Browser audio capture"
    >
      <div className="welcome listening-welcome">
        <div className="listening-summary">
          <div className="listening-title">
            <h2>
              {active
                ? "Listening"
                : entries.length
                  ? "Your transcript"
                  : "Start listening"}
            </h2>
            {!hasSession && (
              <StatusChip tone="neutral" className="mac-only-chip">
                Mac only
              </StatusChip>
            )}
          </div>
          {((state.status !== "idle" && !active) || loading) && (
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
          <AudioSourceStatus state={state} />
        </div>
        <div className="browser-audio-actions listening-controls">
          {topicAction}
          {!active && !pending && !loading && (
            <Button onClick={() => void start()}>Start listening</Button>
          )}
          {modelPicker}
          {active && !loading && (
            <Button
              variant="ghost"
              size={40}
              className="capture-action"
              onClick={pause}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </Button>
          )}
          {(active || pending) && (
            <Button
              variant="ghost"
              size={40}
              className="capture-action"
              onClick={stop}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
              Stop
            </Button>
          )}
        </div>
      </div>
      {modelNotice}
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
      {children}
      {(active || entries.length > 0) && (
        <details className="transcript-details">
          <summary>Transcript ({entries.length})</summary>
          <section aria-label="Live transcript" className="transcript-entries">
            {entries.length > 0 && (
              <div className="transcript-toolbar">
                <Button variant="ghost" onClick={clearTranscript}>
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
    </section>
  );
}
