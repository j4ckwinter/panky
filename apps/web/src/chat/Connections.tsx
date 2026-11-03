import { BannerToast, Button, Stack, Text } from "@jack.winter/pancake-ui";
import type { NotionConnection } from "@panky/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../api/chat";

import { NotionSources } from "./NotionSources";
import { ExperienceSources } from "./ExperienceSources";

export type ConnectionReturn = "connected" | "denied" | "error" | null;

type ConnectionState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "loaded"; connection: NotionConnection };

export function Connections({
  api,
  returnResult,
  clearReturn,
  onBackToInterview,
  pending = false,
}: {
  api: Api;
  returnResult: ConnectionReturn;
  clearReturn: () => void;
  onBackToInterview?: () => void;
  pending?: boolean;
}) {
  const [state, setState] = useState<ConnectionState>({ kind: "loading" });
  const [error, setError] = useState("");
  const [operation, setOperation] = useState<
    "authorizing" | "checking" | "disconnecting" | null
  >(null);
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const [legacyRevision, setLegacyRevision] = useState(0);
  const sourcesChanged = useCallback(() => {
    setLegacyRevision((value) => value + 1);
  }, []);
  const [sourceRevision, setSourceRevision] = useState(0);
  const updateConnection = useCallback((connection: NotionConnection) => {
    setState({ kind: "loaded", connection });
  }, []);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const mounted = useRef(false);
  const disconnectButton = useRef<HTMLButtonElement>(null);
  const keepConnectedButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirmDisconnect) keepConnectedButton.current?.focus();
    else if (wasConfirming.current) disconnectButton.current?.focus();
    wasConfirming.current = confirmDisconnect;
  }, [confirmDisconnect]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    void api
      .notionConnection()
      .then((connection) => {
        if (alive) setState({ kind: "loaded", connection });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(errorMessage(cause));
        setState({ kind: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [api, attempt]);

  async function run(action: "authorizing" | "checking" | "disconnecting") {
    if (active.current) return;
    active.current = true;
    setOperation(action);
    setError("");
    clearReturn();
    try {
      if (action === "authorizing") {
        const { url } = await api.authorizeNotion();
        if (mounted.current) window.location.assign(url);
      } else if (action === "checking") {
        const connection = await api.checkNotion();
        if (mounted.current) setState({ kind: "loaded", connection });
      } else {
        await api.disconnectNotion();
        if (mounted.current) {
          setState({ kind: "loaded", connection: { kind: "disconnected" } });
          setConfirmDisconnect(false);
        }
      }
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      active.current = false;
      if (mounted.current) {
        setOperation(null);
        if (action === "checking") setSourceRevision((value) => value + 1);
      }
    }
  }

  const connection = state.kind === "loaded" ? state.connection : null;
  const linked =
    connection?.kind === "connected" ||
    connection?.kind === "reconnect_required";
  const busy = operation !== null;
  return (
    <div className="connections-scroll">
      <section className="connections-panel" aria-label="Your connections">
        {onBackToInterview && (
          <div>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={onBackToInterview}
            >
              Back to interview
            </Button>
          </div>
        )}
        <div className="connections-intro">
          <Text as="h2" variant="title">
            Bring your tools to Panky
          </Text>
          <p>Connect your own workspace. You choose what to share.</p>
        </div>
        {returnResult === "denied" && (
          <p className="connections-notice" role="status">
            Notion access was not granted. You can try connecting again.
          </p>
        )}
        {returnResult === "error" && (
          <BannerToast tone="error" title="Notion could not connect">
            The connection could not be completed. Check its status below, then
            try again.
          </BannerToast>
        )}
        {returnResult === "connected" && connection?.kind === "connected" && (
          <p className="connections-notice" role="status">
            Notion connected.
          </p>
        )}
        {error && (
          <BannerToast tone="error" title="Could not update connection">
            {error}
          </BannerToast>
        )}
        <section
          className="notion-connection-card"
          aria-labelledby="notion-connection-title"
        >
          <div className="notion-connection-heading">
            <span className="notion-connection-icon" aria-hidden="true">
              N
            </span>
            <div>
              <Text as="h2" variant="heading" id="notion-connection-title">
                Notion
              </Text>
              <p className="muted">Your notes, projects and experience.</p>
            </div>
          </div>
          {state.kind === "loading" && <p role="status">Loading connection…</p>}
          {state.kind === "failed" && (
            <Button
              variant="secondary"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          )}
          {connection?.kind === "unavailable" && (
            <p>
              Notion connections are not available on this Panky server yet.
            </p>
          )}
          {connection?.kind === "disconnected" && (
            <Stack gap="space16">
              <p>
                Connect Notion to grant Panky read access to pages you choose.
                Connecting grants access; choose pages separately to create
                local copies for interview answers.
              </p>
              <div className="notion-connection-actions">
                <Button
                  disabled={busy}
                  onClick={() => {
                    void run("authorizing");
                  }}
                >
                  {operation === "authorizing"
                    ? "Connecting…"
                    : "Connect Notion"}
                </Button>
              </div>
            </Stack>
          )}
          {linked && (
            <Stack gap="space16">
              <div className="notion-workspace">
                <strong>{connection.workspace.name}</strong>
                <p role="status">
                  {connection.kind === "connected"
                    ? "Connected"
                    : "Reconnect required"}
                </p>
                <p className="muted">
                  Connected{" "}
                  {new Date(connection.connectedAt).toLocaleDateString()}
                </p>
              </div>
              <p>
                {connection.kind === "reconnect_required"
                  ? "Panky could not confirm access to this workspace. Reconnect, then refresh each page to revalidate its content before using it in new answers."
                  : "Your workspace is connected. Choose the pages you want to import below."}
              </p>
              {confirmDisconnect ? (
                <div
                  className="notion-disconnect-confirmation"
                  role="group"
                  aria-label="Disconnect Notion confirmation"
                >
                  <strong>Disconnect Notion?</strong>
                  <p>
                    This cancels imports and refreshes, removes this connection
                    and deletes its imported pages and search index. Saved
                    conversations and their evidence excerpts remain. Separate
                    owner imports through the internal connection stay
                    unchanged.
                  </p>
                  <div className="notion-connection-actions">
                    <Button
                      disabled={busy}
                      onClick={() => {
                        void run("disconnecting");
                      }}
                    >
                      {operation === "disconnecting"
                        ? "Disconnecting…"
                        : "Confirm disconnect"}
                    </Button>
                    <Button
                      ref={keepConnectedButton}
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Keep connected
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="notion-connection-actions">
                  {connection.kind === "reconnect_required" ? (
                    <Button
                      disabled={busy || sourcesBusy}
                      onClick={() => {
                        void run("authorizing");
                      }}
                    >
                      {operation === "authorizing"
                        ? "Connecting…"
                        : "Reconnect Notion"}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy || sourcesBusy}
                      onClick={() => {
                        void run("checking");
                      }}
                    >
                      {operation === "checking"
                        ? "Checking…"
                        : "Check connection"}
                    </Button>
                  )}
                  <Button
                    ref={disconnectButton}
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      clearReturn();
                      setConfirmDisconnect(true);
                    }}
                  >
                    Disconnect Notion
                  </Button>
                </div>
              )}
            </Stack>
          )}
          {linked && (
            <NotionSources
              key={`${connection.workspace.id}-${connection.connectedAt}`}
              api={api}
              connected={connection.kind === "connected"}
              revision={sourceRevision}
              disabled={busy}
              onBusy={setSourcesBusy}
              onConnectionChange={updateConnection}
              onSourcesChanged={sourcesChanged}
            />
          )}
        </section>
        <ExperienceSources
          api={api}
          disabled={pending || busy || sourcesBusy}
          revision={legacyRevision}
        />
        <p className="connections-privacy">
          Imported content is stored and processed on the Windows PC hosting
          Panky. Other Panky accounts cannot access your sources; the PC's
          operator can access data stored on that machine.
        </p>
      </section>
    </div>
  );
}
