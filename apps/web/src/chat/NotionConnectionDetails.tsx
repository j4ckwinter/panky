import {
  BannerToast,
  Button,
  Inline,
  Stack,
  StatusChip,
  Surface,
  Text,
} from "@jack.winter/pancake-ui";
import type { NotionConnection } from "@panky/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../api/chat";
import { ExperienceSources } from "./ExperienceSources";
import { NotionSources } from "./NotionSources";

export type ConnectionReturn = "connected" | "denied" | "error" | null;

type ConnectionState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "loaded"; connection: NotionConnection };

export function NotionConnectionDetails({
  api,
  returnResult,
  clearReturn,
  onBack,
  pending = false,
}: {
  api: Api;
  returnResult: ConnectionReturn;
  clearReturn: () => void;
  onBack: () => void;
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
  const backButton = useRef<HTMLAnchorElement>(null);
  const disconnectButton = useRef<HTMLButtonElement>(null);
  const keepConnectedButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    backButton.current?.focus();
  }, []);

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
        <nav aria-label="Breadcrumb" className="connection-breadcrumbs">
          <ol>
            <li>
              <a
                ref={backButton}
                href="?view=connections"
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onBack();
                }}
              >
                Connections
              </a>
            </li>
            <li>
              <span aria-current="page">Notion</span>
            </li>
          </ol>
        </nav>
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
        <Surface
          role="region"
          className="notion-connection-card"
          aria-labelledby="notion-connection-title"
        >
          <Inline
            gap="space12"
            wrap={false}
            className="notion-connection-heading"
          >
            <span className="notion-connection-icon" aria-hidden="true">
              N
            </span>
            <div>
              <Text as="h2" variant="heading" id="notion-connection-title">
                Notion
              </Text>
              <p className="muted">Your notes, projects and experience.</p>
            </div>
          </Inline>
          {state.kind === "loading" && <p role="status">Loading connection…</p>}
          {state.kind === "failed" && (
            <Button
              size={40}
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
            <Stack gap="space12">
              <p>
                Connect your workspace, then choose pages to use in chat and
                Interview. Only selected pages are imported.
              </p>
              <div className="notion-connection-actions">
                <Button
                  size={40}
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
            <Stack gap="space12">
              <Inline gap="space12" className="notion-workspace">
                <strong>{connection.workspace.name}</strong>
                <StatusChip
                  role="status"
                  tone={connection.kind === "connected" ? "success" : "warning"}
                >
                  {connection.kind === "connected"
                    ? "Connected"
                    : "Reconnect required"}
                </StatusChip>
                <p className="muted">
                  Connected{" "}
                  {new Date(connection.connectedAt).toLocaleDateString()}
                </p>
              </Inline>
              {connection.kind === "reconnect_required" && (
                <p>
                  Reconnect, then refresh each page to use it in new answers.
                </p>
              )}
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
                      size={40}
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
                      size={40}
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
                      size={40}
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
                      size={40}
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
                    size={40}
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
        </Surface>
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
