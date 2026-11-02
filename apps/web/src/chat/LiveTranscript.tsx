import { BannerToast, Button } from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState } from "react";
import { BrowserAudio, initialAudioState } from "./browserAudio";
import {
  BrowserTranscription,
  initialTranscriptionState,
} from "./transcription";

type Entry = {
  id: number;
  source: "shared" | "microphone";
  text: string;
  elapsedMs: number;
};

export function LiveTranscript() {
  const [state, setState] = useState(initialAudioState);
  const [speech, setSpeech] = useState(initialTranscriptionState);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [removing, setRemoving] = useState(false);
  const capture = useRef<BrowserAudio | null>(null);
  const transcriber = useRef<BrowserTranscription | null>(null);
  const speechStatus = useRef(initialTranscriptionState.status);
  const nextId = useRef(0);
  useEffect(() => {
    let mounted = true;
    const model = new BrowserTranscription(
      (value) => {
        speechStatus.current = value.status;
        if (mounted) setSpeech(value);
      },
      (source, text, elapsedMs) => {
        if (mounted && text.trim())
          setEntries((items) =>
            [...items, { id: nextId.current++, source, text, elapsedMs }].slice(
              -50,
            ),
          );
      },
      () => controller.stop(),
    );
    const controller = new BrowserAudio(
      (value) => {
        if (mounted) setState(value);
        if (
          ["stopped", "paused", "error"].includes(value.status) &&
          speechStatus.current !== "error"
        )
          model.stop();
      },
      (source, samples) => {
        if (["ready", "transcribing"].includes(speechStatus.current))
          model.submit(source, samples);
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
      window.removeEventListener("pagehide", stop);
      controller.dispose();
      model.dispose();
      capture.current = null;
      transcriber.current = null;
    };
  }, []);
  const active = state.status === "listening";
  const pending = state.status === "starting";
  const loading = speech.status === "loading";
  const modelReady =
    speech.status === "ready" || speech.status === "transcribing";
  return (
    <section className="live-transcript" aria-label="Browser audio capture">
      <h3>Browser audio</h3>
      <p>
        Choose the call's tab, window or screen in the browser's sharing picker
        and enable Share audio. Then allow microphone access. Available sources
        depend on your browser and Mac. Use headphones.
      </p>
      <p className="interview-note">
        Load the English speech model to add local transcripts, or start without
        it to test audio levels. No separate app is needed. Questions and
        answers are not generated automatically.
      </p>
      <section aria-label="Local speech model" className="speech-model">
        <p>
          Whisper tiny.en · about 70 MB for the model and runtime on first use.
          Model files download from Hugging Face and are cached in this browser.
          Audio is never sent there.
        </p>
        <div className="browser-audio-actions">
          <Button
            variant="secondary"
            disabled={active || pending || loading || modelReady || removing}
            onClick={() => void transcriber.current?.load()}
          >
            Load speech model
          </Button>
          {loading && (
            <Button
              variant="secondary"
              onClick={() => transcriber.current?.stop()}
            >
              Cancel model load
            </Button>
          )}
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
        {speech.error && (
          <BannerToast tone="error" title="Transcription unavailable">
            {speech.error}
          </BannerToast>
        )}
      </section>
      {state.error && (
        <BannerToast tone="error" title="Audio capture unavailable">
          {state.error}
        </BannerToast>
      )}
      <p role="status">
        {
          {
            idle: "Ready to test audio",
            starting: "Waiting for sharing and microphone permission",
            listening: "Listening in this browser",
            paused: "Paused — audio released",
            stopped: "Stopped — audio released",
            error: "Not listening",
          }[state.status]
        }
      </p>
      <div className="browser-audio-actions">
        <Button
          disabled={active || pending || loading || removing}
          onClick={() => void capture.current?.start()}
        >
          Start listening
        </Button>
        <Button
          variant="secondary"
          disabled={!active}
          onClick={() => capture.current?.stop("paused")}
        >
          Pause
        </Button>
        <Button
          variant="secondary"
          disabled={!active && !pending}
          onClick={() => capture.current?.stop()}
        >
          Stop
        </Button>
      </div>
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
      {active && (
        <p>
          Selected surface: {state.surface}.{" "}
          {modelReady
            ? "Local transcription is enabled."
            : "Audio levels only; load the speech model before starting to transcribe."}{" "}
          A silent meter does not prove capture works.
        </p>
      )}
      <section aria-label="Live transcript" className="transcript-entries">
        <div className="browser-audio-actions">
          <h4>Transcript</h4>
          <Button
            variant="ghost"
            disabled={!entries.length}
            onClick={() => setEntries([])}
          >
            Clear transcript
          </Button>
        </div>
        {entries.length === 0 ? (
          <p>
            No transcript yet. Speech appears after each five-second audio chunk
            is processed.
          </p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id}>
              <p className="transcript-source">
                {entry.source === "shared" ? "Shared audio" : "Microphone"} ·{" "}
                {(entry.elapsedMs / 1000).toFixed(1)}s processing
              </p>
              <p>{entry.text}</p>
            </article>
          ))
        )}
      </section>
      <p className="interview-note">
        Up to 50 transcript segments stay in this view until cleared or you
        leave Interview. Raw audio stays in bounded memory buffers and is never
        uploaded, recorded to disk or played back. Screen frames are not
        displayed, recorded or uploaded. Pause, Stop and leaving Interview
        release capture and discard pending transcription. Load the cached model
        again before restarting transcription. A fresh Start requires choosing a
        source again. Dismiss any permission prompt left open after Stop.
      </p>
    </section>
  );
}
