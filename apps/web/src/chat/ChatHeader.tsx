import { Button, Inline, Text } from "@jack.winter/pancake-ui";
import type { ReactNode, RefObject } from "react";
import { ActionMenu } from "../components/ActionMenu";

export function ChatHeader({
  toolsSlot,
  title,
  connected,
  streaming,
  serverBusy,
  pending,
  sidebarOpen,
  menu,
  onToggleSidebar,
  onRefresh,
  onCreate,
}: {
  toolsSlot?: ReactNode;
  title: string;
  connected: boolean;
  streaming: boolean;
  serverBusy: boolean;
  pending: boolean;
  sidebarOpen: boolean;
  menu: RefObject<HTMLButtonElement | null>;
  onToggleSidebar: () => void;
  onRefresh: () => void;
  onCreate: () => void;
}) {
  return (
    <header className="chat-header">
      <div className="chat-heading">
        <Button
          ref={menu}
          aria-label="Conversations"
          aria-controls="conversation-sidebar"
          className="mobile-menu header-icon-button"
          size={40}
          variant="ghost"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </Button>
        <Text as="h1" variant="heading">
          {title}
        </Text>
      </div>
      <Inline gap="space12" className="chat-header-actions">
        {toolsSlot}
        <span
          className={`connection ${!connected ? "offline" : !streaming && !serverBusy ? "connection-idle" : ""}`}
          title={connected ? "Connected" : "Connection lost"}
        >
          <span aria-hidden="true" />
          <span className="connection-label">
            {!connected
              ? "Connection lost"
              : streaming
                ? "Replying"
                : serverBusy
                  ? "Busy in another tab"
                  : "Connected"}
          </span>
        </span>
        <Button
          variant="ghost"
          className="header-icon-button desktop-refresh"
          size={40}
          aria-label="Refresh history"
          title="Refresh history"
          onClick={onRefresh}
          disabled={pending}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 11a9 9 0 0 1 15.36-6.36L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.36 6.36L3 17M7 17H3v4" />
          </svg>
        </Button>
        <Button
          className="mobile-menu header-icon-button"
          variant="ghost"
          size={40}
          aria-label="Start new chat"
          title="New chat"
          disabled={pending}
          onClick={onCreate}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Button>
        <ActionMenu
          label="Chat options"
          iconOnly
          className="mobile-header-menu"
        >
          <Button variant="ghost" disabled={pending} onClick={onRefresh}>
            Refresh history
          </Button>
        </ActionMenu>
      </Inline>
    </header>
  );
}
