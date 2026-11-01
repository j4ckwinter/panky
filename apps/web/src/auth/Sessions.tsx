import { useModalDialog } from "../components/useModalDialog";
import { DialogHeading } from "../components/DialogHeading";
import { BannerToast, Button, Stack } from "@jack.winter/pancake-ui";
import { useEffect, useState } from "react";
import { ApiError } from "../api/ApiError";
import {
  type DeviceSession,
  revokeSession,
  sessions,
  signInError,
} from "./api";

export function Sessions({
  onClose,
  onSignedOut,
  error: initialError,
}: {
  onClose: () => void;
  onSignedOut: () => void;
  error: string;
}) {
  const dialog = useModalDialog();
  const [items, setItems] = useState<DeviceSession[]>([]);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void sessions()
      .then((result) => {
        if (alive) setItems(result);
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

  async function revoke(item: DeviceSession) {
    setLoading(true);
    setError("");
    try {
      await revokeSession(item.id);
      if (item.current) onSignedOut();
      else
        setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSignedOut();
      else setError(signInError(cause));
    } finally {
      setLoading(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="sessions-dialog"
      aria-labelledby="sessions-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <Stack gap="space16">
        <DialogHeading id="sessions-title" onClose={onClose}>
          Signed-in devices
        </DialogHeading>
        <p className="auth-description">Sign out a device to end its access.</p>
        {error && (
          <BannerToast tone="error" title="Could not update sessions">
            {error}
          </BannerToast>
        )}
        {loading && <p role="status">Loading…</p>}
        <ul className="session-list">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.current ? "This device" : "Other device"}</strong>
                <p>Signed in {new Date(item.createdAt).toLocaleString()}</p>
                <p>Expires {new Date(item.expiresAt).toLocaleDateString()}</p>
              </div>
              <Button
                variant="secondary"
                className="visible-action"
                disabled={loading}
                aria-label={
                  item.current
                    ? "Sign out this device"
                    : `Sign out device from ${new Date(item.createdAt).toLocaleString()}`
                }
                onClick={() => {
                  void revoke(item);
                }}
              >
                Sign out
              </Button>
            </li>
          ))}
        </ul>
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
