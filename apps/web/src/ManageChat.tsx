import { BannerToast, Button, Stack, TextField } from "@jack.winter/pancake-ui";
import type { Conversation } from "@panky/shared";
import { useEffect, useRef, useState } from "react";

export function ManageChat({
  conversation,
  pending,
  error,
  onRename,
  onDelete,
  onClose,
}: {
  conversation: Conversation;
  pending: boolean;
  error: string;
  onRename: (title: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(conversation.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.getClientRects().length)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sessions-dialog manage-chat-dialog"
      aria-labelledby="manage-chat-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <Stack gap="space16">
        <div className="dialog-heading">
          <h2 id="manage-chat-title">
            {confirmDelete ? "Delete chat?" : "Manage chat"}
          </h2>
          <Button
            variant="ghost"
            className="dialog-close"
            aria-label="Close"
            title="Close"
            disabled={pending}
            onClick={onClose}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </Button>
        </div>
        {error && (
          <BannerToast tone="error" title="Could not update chat">
            {error}
          </BannerToast>
        )}
        {confirmDelete ? (
          <>
            <p>
              Delete “{conversation.title}” and all its messages? This cannot be
              undone.
            </p>
            <div className="dialog-actions">
              <Button
                disabled={pending}
                onClick={async () => {
                  if (await onDelete()) onClose();
                }}
              >
                Delete permanently
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setConfirmDelete(false)}
              >
                Keep chat
              </Button>
            </div>
          </>
        ) : (
          <>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (title.trim() && (await onRename(title.trim()))) onClose();
              }}
            >
              <Stack gap="space16">
                <TextField
                  label="Chat name"
                  value={title}
                  maxLength={120}
                  required
                  disabled={pending}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
                <div className="dialog-actions">
                  <Button type="submit" disabled={pending || !title.trim()}>
                    Save name
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                </div>
              </Stack>
            </form>
            <Button
              variant="secondary"
              disabled={pending}
              className="delete-chat-action"
              onClick={() => setConfirmDelete(true)}
            >
              Delete chat
            </Button>
          </>
        )}
      </Stack>
    </dialog>
  );
}
