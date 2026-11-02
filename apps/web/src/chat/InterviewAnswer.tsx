import { Button, Text } from "@jack.winter/pancake-ui";
import type { Message, TaskRun } from "@panky/shared";
import type { RefObject } from "react";
import { Markdown } from "./Markdown";
import { SourceEvidence } from "./SourceEvidence";

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
        <Text as="h2" variant="heading">
          {viewingEarlier ? "Earlier question" : "Current question"}
        </Text>
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
        <p className="interview-note">
          {viewingEarlier
            ? `Current provider: ${providerLabel}`
            : providerLabel}
        </p>
      </div>
      <div className="interview-response">
        <Markdown>
          {answer?.content ||
            (run?.status === "running"
              ? "Waiting for response…"
              : "No response text was saved.")}
        </Markdown>
      </div>
      <SourceEvidence sources={answer?.sources ?? []} />
    </section>
  );
}
