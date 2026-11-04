import { MessageComposer } from "./MessageComposer";
import { Button, LoadingIndicator } from "@jack.winter/pancake-ui";
import { type TaskRun } from "@panky/shared";
import { type ReactNode, type RefObject } from "react";

export function ChatComposer({
  modelPicker,
  modelNotice,
  input,
  draft,
  setDraft,
  connected,
  serverBusy,
  streaming,
  pending,
  submissionAccepted,
  cancelling,
  runningTask,
  showJump,
  jumpToLatest,
  showRecoveryNote,
  onSend,
  onCancel,
}: {
  modelPicker?: ReactNode;
  modelNotice?: ReactNode;
  input: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (value: string) => void;
  connected: boolean;
  serverBusy: boolean;
  streaming: boolean;
  pending: boolean;
  submissionAccepted: boolean;
  cancelling: boolean;
  runningTask?: TaskRun;
  showJump: boolean;
  jumpToLatest: () => void;
  showRecoveryNote: boolean;
  onSend: (content: string) => void;
  onCancel: (id: string) => void;
}) {
  const composerStatus = !connected
    ? "Connection lost. Refresh history to reconnect."
    : serverBusy && !streaming
      ? "Another tab is running a task. Wait for it to finish."
      : "";
  const unavailable = pending || serverBusy || !connected;
  return (
    <div className="composer-area">
      {showJump && (
        <div className="jump-to-latest">
          <Button
            variant="secondary"
            className="jump-button"
            aria-label="Jump to latest"
            title="Jump to latest"
            onClick={jumpToLatest}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14m-6-6 6 6 6-6" />
            </svg>
          </Button>
        </div>
      )}
      {pending && (
        <div className="composer-progress">
          <LoadingIndicator
            label={streaming ? "Panky is replying…" : "Loading conversation…"}
          />
        </div>
      )}
      <MessageComposer
        input={input}
        label="Message"
        placeholder="Message Panky"
        value={draft}
        onChange={setDraft}
        onSubmit={onSend}
        disabled={pending && !submissionAccepted}
        submitDisabled={unavailable}
        submitLabel="Send message"
        describedBy={composerStatus ? "composer-help" : undefined}
        actions={modelPicker}
        submitAction={
          runningTask ? (
            <Button
              className="send-button"
              size={40}
              type="button"
              aria-label="Stop response"
              title="Stop response"
              disabled={cancelling}
              onClick={() => onCancel(runningTask.id)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </Button>
          ) : undefined
        }
      />
      {modelNotice}
      {composerStatus && (
        <p id="composer-help" className="composer-status" role="status">
          {composerStatus}
        </p>
      )}
      {showRecoveryNote && (
        <p className="composer-note">
          Refresh history before sending again. Your messages are never retried
          automatically.
        </p>
      )}
    </div>
  );
}
