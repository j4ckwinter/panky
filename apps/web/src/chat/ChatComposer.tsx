import { Button, LoadingIndicator, Textarea } from "@jack.winter/pancake-ui";
import { MESSAGE_MAX_CHARS, type TaskRun } from "@panky/shared";
import { useLayoutEffect, type RefObject } from "react";

export function ChatComposer({
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
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    const resize = () => {
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight}px`;
    };
    resize();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      resize();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [draft]);
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
      <form
        className="composer"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          if (!unavailable && draft.trim()) onSend(draft.trim());
        }}
      >
        <Textarea
          ref={input}
          label="Message"
          autoComplete="off"
          rows={1}
          maxLength={MESSAGE_MAX_CHARS}
          value={draft}
          placeholder="Message Panky"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return;
            event.preventDefault();
            if (!event.repeat) event.currentTarget.form?.requestSubmit();
          }}
          aria-describedby={composerStatus ? "composer-help" : undefined}
          disabled={pending && !submissionAccepted}
        />
        {runningTask ? (
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
        ) : (
          <Button
            className="send-button"
            size={40}
            type="submit"
            disabled={unavailable || !draft.trim()}
            aria-label="Send message"
            title="Send message"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </Button>
        )}
      </form>
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
