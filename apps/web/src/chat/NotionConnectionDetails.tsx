import {
  BannerToast,
  Button,
  Inline,
  Stack,
  StatusChip,
} from "@jack.winter/pancake-ui";
import type { NotionConnection } from "@panky/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../api/chat";
import { ExperienceSources } from "./ExperienceSources";
import { ConnectionDetails } from "./ConnectionDetails";
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
    <ConnectionDetails
      name="Notion"
      onBack={onBack}
      description="Your notes, projects and experience."
      actions={
        <>
          {connection?.kind === "disconnected" && (
            <div className="notion-connection-actions">
              <Button
                size={40}
                disabled={busy}
                onClick={() => {
                  void run("authorizing");
                }}
              >
                {operation === "authorizing" ? "Connecting…" : "Connect Notion"}
              </Button>
            </div>
          )}
          {linked && !confirmDisconnect && (
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
                  {operation === "checking" ? "Checking…" : "Check connection"}
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
        </>
      }
    >
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
      <div className="connection-overview">
        <p>
          Bring your experience into the conversation. Import selected Notion
          pages so Panky can use your notes, projects and examples in chat and
          Interview.
        </p>
        <ul>
          <li>
            <strong>Choose what to share.</strong> Only the pages you select are
            imported.
          </li>
          <li>
            <strong>Get answers with context.</strong> Relevant passages are
            included automatically when you ask a question.
          </li>
          <li>
            <strong>Keep your sources current.</strong> Refresh imported pages
            whenever your notes change.
          </li>
        </ul>
      </div>
      <section
        role="region"
        className="connection-card"
        aria-label="Notion connection"
      >
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
          <p>Notion connections are not available on this Panky server yet.</p>
        )}
        {connection?.kind === "disconnected" && (
          <p>Connect your workspace to choose pages for chat and Interview.</p>
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
              <p>Reconnect, then refresh each page to use it in new answers.</p>
            )}
            {confirmDisconnect && (
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
                  owner imports through the internal connection stay unchanged.
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
        Imported content is stored on the Windows PC hosting Panky. Relevant
        passages are sent to the model you select for answers. Other Panky
        accounts cannot access your sources; the PC's operator can access data
        stored on that machine.
      </p>
    </ConnectionDetails>
  );
}
