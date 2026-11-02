import { BannerToast, Button } from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState } from "react";
import { BrowserAudio, initialAudioState } from "./browserAudio";

export function LiveTranscript() {
  const [state, setState] = useState(initialAudioState);
  const capture = useRef<BrowserAudio | null>(null);
  useEffect(() => {
    const controller = new BrowserAudio(setState);
    capture.current = controller;
    const stop = () => controller.stop();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      controller.dispose();
      capture.current = null;
    };
  }, []);
  const active = state.status === "listening";
  const pending = state.status === "starting";
  return (
    <section className="live-transcript" aria-label="Browser audio capture">
      <h3>Browser audio</h3>
      <p>
        Start listening, choose the call's tab, window or screen in your
        browser's sharing picker, and enable Share audio. Then allow microphone
        access. Available audio sources depend on your browser and Mac. No
        separate app is needed.
      </p>
      <p className="interview-note">
        Capture feasibility test: these meters check shared audio and your
        microphone separately. Transcription and automatic questions are not
        connected yet. Use headphones to reduce microphone echo.
      </p>
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
          disabled={active || pending}
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
          Selected surface: {state.surface}. A moving shared-audio meter
          confirms sound is reaching Panky; a silent meter does not prove
          capture works.
        </p>
      )}
      <p className="interview-note">
        Audio is measured in browser memory only. Nothing is recorded, uploaded,
        played back or saved. The browser also requires a video track for its
        sharing picker; Panky does not display, record or upload that video.
        Pause, Stop and leaving Interview release all captured tracks. Starting
        again requires choosing a source again. Stop during a pending permission
        prompt cancels this attempt; dismiss the browser prompt if it stays
        open.
      </p>
    </section>
  );
}
