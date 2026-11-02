import { useEffect, useRef, useState } from "react";
import type { AudioCaptureState } from "./browserAudio";

export function AudioSourceStatus({ state }: { state: AudioCaptureState }) {
  const activity = useRef({
    started: 0,
    shared: -Infinity,
    microphone: -Infinity,
  });
  const [status, setStatus] = useState("Checking shared audio…");
  useEffect(() => {
    const now = performance.now();
    if (state.status !== "listening") {
      activity.current = {
        started: 0,
        shared: -Infinity,
        microphone: -Infinity,
      };
      setStatus("Checking shared audio…");
      return;
    }
    const recent = activity.current;
    recent.started ||= now;
    if (state.sharedLevel >= 1) recent.shared = now;
    if (state.microphoneLevel >= 1) recent.microphone = now;
    setStatus(
      now - recent.shared < 5000
        ? "Shared audio detected"
        : now - recent.started < 3000
          ? "Checking shared audio…"
          : now - recent.microphone < 3000
            ? "Only microphone audio detected"
            : "Waiting for shared audio",
    );
  }, [state]);
  if (state.status !== "listening") return null;
  return (
    <div
      className={`audio-source-status${status === "Only microphone audio detected" ? " audio-source-warning" : ""}`}
      role="status"
      aria-label="Audio source status"
    >
      <span>
        {status}
        {status === "Only microphone audio detected" &&
          ". Enable Share tab audio."}
      </span>
    </div>
  );
}
