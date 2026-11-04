import { useModalDialog } from "../../components/useModalDialog";
import { DialogHeading } from "../../components/DialogHeading";
import { BannerToast, Button, Stack, TextField } from "@jack.winter/pancake-ui";
import type { Conversation } from "@panky/shared";
import { useState } from "react";

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
  const dialog = useModalDialog();
  const [title, setTitle] = useState(conversation.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
        <DialogHeading
          id="manage-chat-title"
          onClose={onClose}
          disabled={pending}
        >
          {confirmDelete ? "Delete chat?" : "Manage chat"}
        </DialogHeading>
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
