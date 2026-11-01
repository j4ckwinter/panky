import {
  BannerToast,
  Button,
  Stack,
  Text,
  TextField,
} from "@jack.winter/pancake-ui";
import { useCallback, useEffect, useState } from "react";
import { type Api, createApi, sessionExpiredEvent } from "./api";
import {
  type AuthStatus,
  authStatus,
  recover,
  registerPasskey,
  signIn,
  signInError,
  signOut,
} from "./auth";
import { Chat } from "./Chat";
import { Sessions } from "./Sessions";

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [attempt, setAttempt] = useState({ id: 0, restoreSession: true });

  const refreshSignedOutStatus = useCallback(() => {
    setApi(null);
    setShowSessions(false);
    setStatus(null);
    setChecking(true);
    setRecovery(false);
    setConfirmed(false);
    setToken("");
    setAttempt((current) => ({ id: current.id + 1, restoreSession: false }));
  }, []);

  useEffect(() => {
    let alive = true;
    setChecking(true);
    void authStatus()
      .then((result) => {
        if (!alive) return;
        setStatus(result);
        if (result.authenticated && attempt.restoreSession) setApi(createApi());
      })
      .catch((cause: unknown) => {
        if (alive) setError(signInError(cause));
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => {
    const expired = () => {
      setError("Your session has ended. Sign in again.");
      refreshSignedOutStatus();
    };
    window.addEventListener(sessionExpiredEvent, expired);
    return () => window.removeEventListener(sessionExpiredEvent, expired);
  }, [refreshSignedOutStatus]);

  async function authenticate() {
    if (loading || !status) return;
    setLoading(true);
    setError("");
    try {
      if (recovery) {
        await recover(token.trim());
        setStatus({ authenticated: false, configured: false });
        setRecovery(false);
        setConfirmed(false);
      } else {
        if (status.configured) await signIn();
        else await registerPasskey(token.trim());
        setToken("");
        setStatus({ authenticated: true, configured: true });
        setApi(createApi());
      }
    } catch (cause) {
      setError(signInError(cause));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await signOut();
      refreshSignedOutStatus();
    } catch (cause) {
      setError(signInError(cause));
      setShowSessions(true);
    } finally {
      setLoading(false);
    }
  }

  if (api)
    return (
      <>
        <Chat
          api={api}
          onDisconnect={() => {
            void logout();
          }}
          onSessions={() => {
            setError("");
            setShowSessions(true);
          }}
        />
        {showSessions && (
          <Sessions
            error={error}
            onClose={() => setShowSessions(false)}
            onSignedOut={refreshSignedOutStatus}
          />
        )}
      </>
    );
  const setup = status && !status.configured;
  const title = checking
    ? "Connecting…"
    : recovery
      ? "Recover access"
      : setup
        ? "Set up Panky"
        : "Sign in";
  return (
    <main className="connect-page">
      <div className="connect-layout">
        <div className="connect-wordmark" aria-hidden="true">
          Panky<span>.</span>
        </div>
        <section className="connect-card" aria-labelledby="connect-title">
          <Stack gap="space24">
            <Text as="h1" variant="title" id="connect-title">
              {title}
            </Text>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void authenticate();
              }}
            >
              <Stack gap="space16">
                {!checking && status && (
                  <>
                    <p className="auth-description">
                      {recovery
                        ? "Use your backend recovery token to remove all passkeys and sign out every device. Your chats will stay saved."
                        : setup
                          ? "Use your backend token once to create your passkey."
                          : "Stay signed in on this device for 30 days."}
                    </p>
                    {(setup || recovery) && (
                      <TextField
                        label={recovery ? "Recovery token" : "Setup token"}
                        type="password"
                        autoComplete="off"
                        required
                        value={token}
                        disabled={loading}
                        onChange={(event) =>
                          setToken(event.currentTarget.value)
                        }
                      />
                    )}
                    {recovery && (
                      <label className="auth-confirm">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={loading}
                          onChange={(event) =>
                            setConfirmed(event.currentTarget.checked)
                          }
                        />
                        Remove existing passkeys and sign out every device
                      </label>
                    )}
                  </>
                )}
                {error && (
                  <BannerToast tone="error" title="Could not sign in">
                    {error}
                  </BannerToast>
                )}
                {!checking && status && (
                  <>
                    <Button
                      type="submit"
                      loading={loading}
                      size={48}
                      disabled={
                        loading ||
                        ((setup || recovery) && !token.trim()) ||
                        (recovery && !confirmed)
                      }
                    >
                      {recovery
                        ? "Reset access"
                        : setup
                          ? "Create passkey"
                          : "Sign in with passkey"}
                    </Button>
                    {status.configured && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={loading}
                        onClick={() => {
                          setRecovery(!recovery);
                          setConfirmed(false);
                          setToken("");
                          setError("");
                        }}
                      >
                        {recovery ? "Back to sign in" : "Recover access"}
                      </Button>
                    )}
                  </>
                )}
                {!checking && !status && (
                  <Button
                    type="button"
                    onClick={() => {
                      setError("");
                      setAttempt((current) => ({
                        ...current,
                        id: current.id + 1,
                      }));
                    }}
                  >
                    Try again
                  </Button>
                )}
              </Stack>
            </form>
          </Stack>
        </section>
      </div>
    </main>
  );
}
