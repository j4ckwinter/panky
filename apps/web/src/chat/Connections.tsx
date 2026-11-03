import { Text } from "@jack.winter/pancake-ui";
import { useEffect, useRef } from "react";
import type { Api } from "../api/chat";
import {
  type ConnectionReturn,
  NotionConnectionDetails,
} from "./NotionConnectionDetails";

export type { ConnectionReturn } from "./NotionConnectionDetails";

export function Connections({
  selectedConnection,
  onSelectConnection,
  ...details
}: {
  api: Api;
  selectedConnection: "notion" | null;
  onSelectConnection: (connection: "notion" | null) => void;
  returnResult: ConnectionReturn;
  clearReturn: () => void;
  pending?: boolean;
}) {
  const tile = useRef<HTMLButtonElement>(null);
  const previousSelection = useRef(selectedConnection);
  useEffect(() => {
    if (previousSelection.current && !selectedConnection) tile.current?.focus();
    previousSelection.current = selectedConnection;
  }, [selectedConnection]);

  if (selectedConnection === "notion")
    return (
      <NotionConnectionDetails
        {...details}
        onBack={() => {
          details.clearReturn();
          onSelectConnection(null);
        }}
      />
    );

  return (
    <div className="connections-scroll">
      <section className="connections-panel" aria-label="Your connections">
        <div className="connections-intro">
          <Text as="h2" variant="heading">
            Your apps
          </Text>
          <p>Connect tools to bring your notes into Panky.</p>
        </div>
        <div className="connections-catalogue">
          <button
            type="button"
            ref={tile}
            className="connection-tile"
            aria-label="View Notion connection"
            onClick={() => onSelectConnection("notion")}
          >
            <span className="notion-connection-icon" aria-hidden="true">
              N
            </span>
            <span className="connection-tile-copy">
              <strong>Notion</strong>
              <span>Your notes, projects and experience.</span>
            </span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  );
}
