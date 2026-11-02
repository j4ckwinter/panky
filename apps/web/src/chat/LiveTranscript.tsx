import { BannerToast, Button } from "@jack.winter/pancake-ui";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AudioSourceStatus } from "./AudioSourceStatus";
import {
  useLiveTranscription,
  type TranscriptEntry,
} from "./useLiveTranscription";

export function LiveTranscript({
  children,
  settingsTarget,
  onTranscript,
  onUseAsQuestion,
  onResetDetection,
}: {
  children?: ReactNode;
  settingsTarget?: HTMLElement | null;
  onTranscript?: (entry: TranscriptEntry) => void;
  onUseAsQuestion?: (text: string) => void;
  onResetDetection?: () => void;
}) {
  const {
    state,
    speech,
    entries,
    removing,
    start,
    pause,
    stop,
    cancelModelLoad,
    loadModel,
    clearTranscript,
    removeModel,
  } = useLiveTranscription({ onTranscript, onResetDetection });
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
        <div className="browser-audio-actions listening-controls">
          {!active && !pending && !loading && (
            <Button disabled={removing} onClick={() => void start()}>
              Start listening
            </Button>
          )}
          {active && !loading && (
            <Button
              variant="secondary"
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
              variant="secondary"
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
          {loading && !active && !pending && (
            <Button variant="secondary" onClick={cancelModelLoad}>
              Cancel model load
            </Button>
          )}
        </div>
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
      {settingsTarget &&
        createPortal(
          <details className="listening-settings">
            <summary>Listening settings</summary>
            <section aria-label="Local speech model" className="speech-model">
              <p>
                English transcription runs locally. The first use downloads
                about 70 MB from Hugging Face and this app, then caches it in
                your browser. You can load it before your call.
              </p>
              <div className="browser-audio-actions">
                <Button
                  variant="secondary"
                  disabled={
                    active || pending || loading || modelReady || removing
                  }
                  onClick={() => void loadModel()}
                >
                  Load speech model
                </Button>
                <Button
                  variant="ghost"
                  disabled={active || pending || removing}
                  onClick={removeModel}
                >
                  Remove downloaded model
                </Button>
              </div>
              <p role="status">
                {removing
                  ? "Removing downloaded model…"
                  : speech.progress ||
                    (modelReady
                      ? "Speech model ready"
                      : "Speech model not loaded")}
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
              microphone access.{" "}
              {active && `Selected source: ${state.surface}. `}A silent meter
              does not confirm audio capture.
            </p>
            <p className="interview-note">
              Audio and unsent transcripts stay on this device. Up to 50
              transcript segments remain until cleared or you leave Interview.
              Pause and Stop discard pending audio and transcription; Start asks
              you to choose a source again. Dismiss any permission prompt left
              open after Stop. Shared speech can suggest editable questions.
              Only Send question sends a question to the model; microphone
              speech is never submitted.
            </p>
          </details>,
          settingsTarget,
        )}
    </section>
  );
}
