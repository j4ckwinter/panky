import { BannerToast, Button, Stack, Text } from "@jack.winter/pancake-ui";
import { useCallback, useEffect, useState } from "react";
import { Access } from "./Access";
import { type Api, createApi, sessionExpiredEvent } from "./api";
import { type AuthStatus, authStatus, signInError, signOut } from "./auth";
import { Chat } from "./Chat";
import { GoogleSignIn } from "./GoogleSignIn";
import { Sessions } from "./Sessions";

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"sessions" | "access" | null>(null);
  const [attempt, setAttempt] = useState({ id: 0, restoreSession: true });
  const refreshSignedOutStatus = useCallback(() => {
    setApi(null);
    setPanel(null);
    setStatus(null);
    setChecking(true);
    setAttempt((current) => ({ id: current.id + 1, restoreSession: false }));
  }, []);
  useEffect(() => {
    let alive = true;
    setChecking(true);
    void authStatus()
      .then((result) => {
        if (!alive) return;
        setStatus(result);
        if (result.authenticated && result.user && attempt.restoreSession)
          setApi(createApi());
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

  const signedIn = useCallback(async () => {
    const result = await authStatus();
    if (!result.authenticated || !result.user)
      throw new Error("Sign-in did not create a session. Try again.");
    setError("");
    setStatus(result);
    setApi(createApi());
  }, []);
  async function logout() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await signOut();
      refreshSignedOutStatus();
    } catch (cause) {
      setError(signInError(cause));
      setPanel("sessions");
    } finally {
      setLoading(false);
    }
  }
  if (api && status?.user)
    return (
      <>
        <Chat
          api={api}
          email={status.user.email}
          onDisconnect={() => {
            void logout();
          }}
          onSessions={() => {
            setError("");
            setPanel("sessions");
          }}
          onAccess={
            status.user.role === "owner" ? () => setPanel("access") : undefined
          }
        />
        {panel === "sessions" && (
          <Sessions
            error={error}
            onClose={() => setPanel(null)}
            onSignedOut={refreshSignedOutStatus}
          />
        )}
        {panel === "access" && status.user.role === "owner" && (
          <Access
            onClose={() => setPanel(null)}
            onSignedOut={refreshSignedOutStatus}
          />
        )}
      </>
    );
  return (
    <main className="connect-page">
      <div className="connect-layout">
        <div className="connect-wordmark" aria-hidden="true">
          Panky<span>.</span>
        </div>
        <section className="connect-card" aria-labelledby="connect-title">
          <Stack gap="space24">
            <Text as="h1" variant="title" id="connect-title">
              {checking ? "Connecting…" : "Sign in"}
            </Text>
            {error && (
              <BannerToast tone="error" title="Could not sign in">
                {error}
              </BannerToast>
            )}
            {!checking && status?.configured && (
              <>
                <p className="auth-description">
                  Continue with your Google account.
                </p>
                <GoogleSignIn onSignedIn={signedIn} />
                <p className="connect-access-note">By invitation only.</p>
              </>
            )}
            {!checking && status && !status.configured && (
              <p className="auth-description">
                Google sign-in is not configured yet. The owner needs to
                configure Panky's Google OAuth client on the backend.
              </p>
            )}
            {!checking && (!status || !status.configured) && (
              <Button
                onClick={() => {
                  setError("");
                  setAttempt((current) => ({ ...current, id: current.id + 1 }));
                }}
              >
                Try again
              </Button>
            )}
          </Stack>
        </section>
      </div>
    </main>
  );
}
