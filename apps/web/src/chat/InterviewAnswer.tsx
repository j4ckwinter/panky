import { PankyMark } from "../components/PankyMark";
import { Button } from "@jack.winter/pancake-ui";
import type { Message, TaskRun } from "@panky/shared";
import type { RefObject } from "react";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";

export function InterviewAnswer({
  question,
  answer,
  run,
  viewingEarlier,
  providerLabel,
  onBack,
  panelRef,
}: {
  question: Message;
  answer?: Message;
  run?: TaskRun;
  viewingEarlier: boolean;
  providerLabel: string;
  onBack: () => void;
  panelRef: RefObject<HTMLElement | null>;
}) {
  return (
    <section
      ref={panelRef}
      tabIndex={0}
      className="interview-result"
      aria-label="Interview answer"
    >
      <div className="interview-question">
        <div className="interview-answer-heading">
          <h2>{viewingEarlier ? "Earlier question" : "Current question"}</h2>
          {answer?.content.trim() && (
            <CopyButton
              key={question.id}
              label="Copy answer"
              text={() => answer.content}
            />
          )}
        </div>
        <p>{question.content}</p>
        {viewingEarlier && (
          <>
            <p className="interview-note">
              Saved response · {run?.status ?? "unavailable"}
            </p>
            <Button variant="ghost" onClick={onBack}>
              Back to current response
            </Button>
          </>
        )}
        {providerLabel === "Demo mode" && (
          <p className="interview-note">Demo mode</p>
        )}
      </div>
      <div className="interview-response">
        <div className="message-meta">
          <PankyMark small />
          <strong>Panky</strong>
        </div>
        <Markdown>
          {answer?.content ||
            (run?.status === "running"
              ? "Waiting for response…"
              : "No response text was saved.")}
        </Markdown>
      </div>
      {run?.error && run.status !== "cancelled" && (
        <p className="response-error" role="alert">
          {run.error}
        </p>
      )}
    </section>
  );
}
