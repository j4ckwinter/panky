import { useModalDialog } from "../components/useModalDialog";
import { DialogHeading } from "../components/DialogHeading";
import { BannerToast, Button, Stack, TextField } from "@jack.winter/pancake-ui";
import { useEffect, useState } from "react";
import { ApiError } from "../api/ApiError";
import {
  type Access as AccessData,
  access,
  invite,
  revokeAccess,
  signInError,
} from "./api";

export function Access({
  onClose,
  onSignedOut,
}: {
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const dialog = useModalDialog();
  const [data, setData] = useState<AccessData | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void access()
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        if (cause instanceof ApiError && cause.status === 401) onSignedOut();
        else setError(signInError(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [attempt, onSignedOut]);
  async function update(operation: () => Promise<void>) {
    setLoading(true);
    setError("");
    try {
      await operation();
      setEmail("");
      setRemoving(null);
      setData(await access());
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSignedOut();
      else setError(signInError(cause));
    } finally {
      setLoading(false);
    }
  }
  const activeEmails = new Set(
    data?.users.filter((user) => user.active).map((user) => user.email),
  );
  const pending =
    data?.invites.filter((item) => !activeEmails.has(item.email)) ?? [];
  return (
    <dialog
      ref={dialog}
      className="sessions-dialog"
      aria-labelledby="access-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <Stack gap="space16">
        <DialogHeading id="access-title" onClose={onClose}>
          People with access
        </DialogHeading>
        <p className="auth-description">
          Invite someone using their Google account email. Chats stay private to
          each account.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading) void update(() => invite(email.trim()));
          }}
        >
          <div className="invite-form-row">
            <TextField
              label="Google account email"
              type="email"
              required
              value={email}
              disabled={loading}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <Button type="submit" disabled={loading || !email.trim()}>
              Invite
            </Button>
          </div>
        </form>
        {error && (
          <BannerToast tone="error" title="Could not update access">
            {error}
          </BannerToast>
        )}
        {loading && <p role="status">Loading…</p>}
        <ul className="session-list access-list">
          {data?.users
            .filter((user) => user.active)
            .map((user) => (
              <li key={user.id}>
                <div>
                  <strong>{user.email}</strong>
                  <p>{user.role === "owner" ? "Owner" : "Member"}</p>
                </div>
                {user.role !== "owner" && (
                  <Button
                    variant="secondary"
                    disabled={loading}
                    aria-label={`Remove access for ${user.email}`}
                    onClick={() => setRemoving(user.email)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          {pending.map((item) => (
            <li key={item.email}>
              <div>
                <strong>{item.email}</strong>
                <p>Invited</p>
              </div>
              <Button
                variant="secondary"
                disabled={loading}
                aria-label={`Remove access for ${item.email}`}
                onClick={() => setRemoving(item.email)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {removing && (
          <div className="access-confirm">
            <Stack gap="space16">
              <p>
                Remove access for {removing}? Their sessions will end. Their
                saved chats will remain private.
              </p>
              <div className="dialog-actions">
                <Button
                  disabled={loading}
                  onClick={() => {
                    void update(() => revokeAccess(removing));
                  }}
                >
                  Remove access
                </Button>
                <Button
                  variant="secondary"
                  disabled={loading}
                  onClick={() => setRemoving(null)}
                >
                  Keep access
                </Button>
              </div>
            </Stack>
          </div>
        )}
        {error && (
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        )}
      </Stack>
    </dialog>
  );
}
