import {
  BannerToast,
  Button,
  Stack,
  StatusChip,
  Text,
  TextField,
} from "@jack.winter/pancake-ui";
import { useState } from "react";
import { type Api, createApi, errorMessage } from "./api";
import { Brand } from "./Brand";
import { Chat } from "./Chat";

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (api) return <Chat api={api} onDisconnect={() => setApi(null)} />;
  return (
    <main className="connect-page">
      <header className="connect-header">
        <Brand />
        <StatusChip tone="warning">Mock provider</StatusChip>
      </header>
      <div className="connect-layout">
        <section className="intro">
          <span className="eyebrow">A LITTLE SPACE TO THINK</span>
          <h1>
            Good things start
            <br />
            with a conversation<span className="brand-dot">.</span>
          </h1>
          <p>
            Your personal teammate, one thought at a time. Connect to your Panky
            backend to pick up where you left off.
          </p>
          <div className="intro-note">
            <span aria-hidden="true">↗</span>
            <p>
              Small beginnings.
              <br />
              <strong>Room to grow.</strong>
            </p>
          </div>
        </section>
        <section className="connect-card" aria-labelledby="connect-title">
          <Stack gap="space24">
            <div>
              <Text as="h2" variant="title" id="connect-title">
                Hello, you.
              </Text>
              <p className="muted">Let’s get you connected.</p>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (loading) return;
                setLoading(true);
                setError("");
                try {
                  const client = createApi(token.trim());
                  await client.health();
                  setToken("");
                  setApi(client);
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Stack gap="space16">
                <TextField
                  label="Access token"
                  type="password"
                  autoComplete="off"
                  required
                  value={token}
                  onChange={(event) => setToken(event.currentTarget.value)}
                  helperText="The token from your backend configuration. Kept only in this tab’s memory."
                />
                {error && (
                  <BannerToast tone="error" title="Could not connect">
                    {error}
                  </BannerToast>
                )}
                <Button
                  type="submit"
                  loading={loading}
                  disabled={!token.trim()}
                  size={48}
                >
                  Connect
                </Button>
              </Stack>
            </form>
            <p className="connect-footnote">
              This first version uses deterministic mock replies. No AI model is
              running, and no tools are executed.
            </p>
          </Stack>
        </section>
      </div>
      <footer className="connect-footer">
        Made for a slower thought and a better next step.
      </footer>
    </main>
  );
}
