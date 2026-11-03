import { Button } from "@jack.winter/pancake-ui";
import { MessageComposer } from "./MessageComposer";
import { useRef, useState } from "react";

export function InterviewReply({
  questionId,
  hidden,
  disabled,
  onSend,
}: {
  questionId: string;
  hidden: boolean;
  disabled: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const draft = drafts[questionId] ?? "";
  const needsReview = failed[questionId] ?? false;
  return (
    <div hidden={hidden}>
      <MessageComposer
        label="Reply or clarify"
        placeholder="Clarify or correct what was heard…"
        value={draft}
        onChange={(value) =>
          setDrafts((previous) => ({ ...previous, [questionId]: value }))
        }
        disabled={pending}
        submitDisabled={disabled || needsReview}
        submitLabel="Send reply"
        onSubmit={async () => {
          if (active.current || disabled || needsReview || !draft.trim())
            return;
          active.current = true;
          setPending(true);
          let accepted = false;
          try {
            accepted = await onSend(draft.trim());
          } catch {
            accepted = false;
          } finally {
            if (accepted)
              setDrafts((previous) => ({ ...previous, [questionId]: "" }));
            else setFailed((previous) => ({ ...previous, [questionId]: true }));
            active.current = false;
            setPending(false);
          }
        }}
      />
      <div className="interview-reply-actions">
        {needsReview ? (
          <>
            <p role="status">
              Reply not confirmed. Check the conversation before sending again.
            </p>
            <Button
              size={40}
              variant="secondary"
              disabled={disabled || pending}
              onClick={() =>
                setFailed((previous) => ({
                  ...previous,
                  [questionId]: false,
                }))
              }
            >
              Review reply
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
