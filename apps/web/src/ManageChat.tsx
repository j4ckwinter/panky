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
      className="sessions-dialog"
      aria-labelledby="manage-chat-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <Stack gap="space16">
        <h2 id="manage-chat-title">
          {confirmDelete ? "Delete chat?" : "Manage chat"}
        </h2>
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
                <Button type="submit" disabled={pending || !title.trim()}>
                  Save name
                </Button>
              </Stack>
            </form>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              Delete chat
            </Button>
            <Button
              className="visible-action"
              variant="secondary"
              disabled={pending}
              onClick={onClose}
            >
              Close
            </Button>
          </>
        )}
      </Stack>
    </dialog>
  );
}
