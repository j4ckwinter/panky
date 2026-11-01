import {
  BannerToast,
  Button,
  Stack,
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
      </header>
      <div className="connect-layout">
        <section className="connect-card" aria-labelledby="connect-title">
          <Stack gap="space24">
            <Text as="h1" variant="title" id="connect-title">
              Connect to Panky
            </Text>
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
                  helperText="Paste the token value only."
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
          </Stack>
        </section>
      </div>
    </main>
  );
}
