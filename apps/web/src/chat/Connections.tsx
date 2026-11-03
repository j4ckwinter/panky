import { Text } from "@jack.winter/pancake-ui";
import { useEffect, useRef } from "react";
import type { Api } from "../api/chat";
import {
  type ConnectionReturn,
  NotionConnectionDetails,
} from "./NotionConnectionDetails";
import { ChatGPTConnectionDetails } from "./ChatGPTConnectionDetails";
import type { ConnectionId, ConnectionItem } from "./connection-catalogue";
import type { ChatGPTState } from "./useChatGPT";
export type { ConnectionReturn } from "./NotionConnectionDetails";

export function Connections({
  selectedConnection,
  onSelectConnection,
  catalogue,
  chatGPT,
  ...details
}: {
  api: Api;
  selectedConnection: ConnectionId | null;
  onSelectConnection: (connection: ConnectionId | null) => void;
  catalogue: ConnectionItem[];
  chatGPT: ChatGPTState;
  returnResult: ConnectionReturn;
  clearReturn: () => void;
  pending?: boolean;
}) {
  const tiles = useRef(new Map<ConnectionId, HTMLButtonElement>());
  const previousSelection = useRef(selectedConnection);
  useEffect(() => {
    if (previousSelection.current && !selectedConnection)
      tiles.current.get(previousSelection.current)?.focus();
    previousSelection.current = selectedConnection;
  }, [selectedConnection]);
  const back = () => {
    details.clearReturn();
    onSelectConnection(null);
  };
  if (selectedConnection === "notion")
    return <NotionConnectionDetails {...details} onBack={back} />;
  if (selectedConnection === "chatgpt")
    return (
      <ChatGPTConnectionDetails
        state={chatGPT}
        pending={details.pending ?? false}
        onBack={back}
      />
    );
  return (
    <div className="connections-scroll">
      <section className="connections-panel" aria-label="Your connections">
        <div className="connections-intro">
          <Text as="h2" variant="heading">
            Your apps
          </Text>
          <p>Connect tools and models to Panky.</p>
        </div>
        <div className="connections-catalogue">
          {catalogue.map((item) => (
            <button
              key={item.id}
              type="button"
              ref={(node) => {
                if (node) tiles.current.set(item.id, node);
                else tiles.current.delete(item.id);
              }}
              className="connection-tile"
              aria-label={`View ${item.name} connection`}
              onClick={() => onSelectConnection(item.id)}
            >
              <span className="connection-icon" aria-hidden="true">
                {item.mark}
              </span>
              <span className="connection-tile-copy">
                <strong>{item.name}</strong>
                <span>{item.description}</span>
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
          ))}
        </div>
      </section>
    </div>
  );
}
