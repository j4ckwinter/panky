import { useEffect, useRef, useState } from "react";

export type DetectionTiming = { transcriptionMs: number; assemblyMs: number };
type Timing = Partial<DetectionTiming> & {
  question: string;
  firstTextMs?: number;
  finished: boolean;
};

export function useResponseTiming() {
  const [timing, setTiming] = useState<Timing | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  function start(question: string, detection?: DetectionTiming) {
    const current = ++generation.current;
    const started = performance.now();
    setTiming({ question, ...detection, finished: false });
    const update = (change: Partial<Timing>) => {
      if (mounted.current && generation.current === current)
        setTiming((value) => (value ? { ...value, ...change } : value));
    };
    return {
      firstText: () => update({ firstTextMs: performance.now() - started }),
      finish: () => update({ finished: true }),
    };
  }
  function reset() {
    generation.current++;
    setTiming(null);
  }
  return { timing, start, reset };
}

export function ResponseTiming({ timing }: { timing: Timing | null }) {
  if (!timing) return null;
  const duration = (value: number | undefined) =>
    value === undefined ? "Not measured" : `${Math.round(value)} ms`;
  return (
    <details className="response-timing">
      <summary>Response timing</summary>
      <p className="interview-note">For: {timing.question}</p>
      <dl>
        <dt>Transcription compute</dt>
        <dd>{duration(timing.transcriptionMs)}</dd>
        <dt>Question assembly</dt>
        <dd>{duration(timing.assemblyMs)}</dd>
        <dt>Send to first text</dt>
        <dd>
          {timing.firstTextMs === undefined
            ? timing.finished
              ? "No response text received"
              : "Waiting for first text…"
            : duration(timing.firstTextMs)}
        </dd>
      </dl>
      <p className="interview-note">
        Transcription sums worker compute for contributing chunks. Assembly runs
        from the first transcript to the question card. Send to first text
        includes connection, backend and model time. Capture buffering, worker
        queue time and your review time are not measured; these are not an
        end-to-end total. Timings stay in this view.
      </p>
    </details>
  );
}
