import { Button } from "@jack.winter/pancake-ui";
import type { Conversation } from "@panky/shared";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActionMenu } from "../components/ActionMenu";
import { Brand } from "../components/Brand";
import type { ConnectionId, ConnectionItem } from "./connection-catalogue";
import { SidebarList } from "./SidebarList";

export type ChatView = "chat" | "interview" | "connections";

export function ChatSidebar({
  conversations,
  currentId,
  pending,
  providerLabel,
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  setSidebarCollapsed,
  menu,
  email,
  onCreate,
  onSelect,
  onManage,
  onAccess,
  onSessions,
  onDisconnect,
  view,
  onInterview,
  onConnections,
  selectedConnection,
  connectionItems,
  onSelectConnection,
  onChat,
}: {
  conversations: Conversation[];
  currentId?: string;
  pending: boolean;
  providerLabel: string;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  menu: RefObject<HTMLButtonElement | null>;
  email: string;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onManage: (conversation: Conversation) => void;
  onAccess?: () => void;
  onSessions: () => void;
  onDisconnect: () => void;
  view: ChatView;
  onInterview: () => void;
  onConnections: () => void;
  selectedConnection: ConnectionId | null;
  connectionItems: ConnectionItem[];
  onSelectConnection: (id: ConnectionId) => void;
  onChat: () => void;
}) {
  const [search, setSearch] = useState("");
  const [connectionSearch, setConnectionSearch] = useState("");
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const panel = sidebar.current;
    const trigger = menu.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        ) ?? [],
      ).filter((button) => button.getClientRects().length > 0);
    focusable()[0]?.focus();
    const closeOnDesktop = () => {
      if (window.matchMedia("(min-width: 641px)").matches)
        setSidebarOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
      if (event.key !== "Tab") return;
      const buttons = focusable();
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeOnDesktop);
      if (window.matchMedia("(max-width: 640px)").matches) trigger?.focus();
    };
  }, [sidebarOpen, setSidebarOpen, menu]);
  return (
    <>
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="conversation-sidebar"
        role={sidebarOpen ? "dialog" : undefined}
        aria-modal={sidebarOpen || undefined}
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label={
          view === "connections" ? "Connections navigation" : "Conversations"
        }
      >
        <div className="feature-rail">
          <Button
            className="mobile-menu sidebar-close"
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            aria-label={
              view === "connections"
                ? "Close connections"
                : "Close conversations"
            }
            title={
              view === "connections"
                ? "Close connections"
                : "Close conversations"
            }
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </Button>
          <nav aria-label="Panky features">
            <Button
              size={40}
              variant="ghost"
              className="sidebar-feature-button"
              aria-label="Chats"
              title="Chats"
              aria-current={view === "chat" ? "page" : undefined}
              disabled={pending}
              onClick={() => {
                setSidebarOpen(false);
                onChat();
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
              </svg>
            </Button>
            <Button
              size={40}
              variant="ghost"
              className="sidebar-feature-button"
              aria-label="Interview"
              title="Interview"
              aria-current={view === "interview" ? "page" : undefined}
              disabled={pending}
              onClick={() => {
                setSidebarOpen(false);
                onInterview();
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
              </svg>
            </Button>
            <Button
              size={40}
              variant="ghost"
              className="sidebar-feature-button"
              aria-label="Connections"
              title="Connections"
              aria-current={view === "connections" ? "page" : undefined}
              disabled={pending}
              onClick={() => {
                setSidebarOpen(false);
                onConnections();
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" />
              </svg>
            </Button>
          </nav>
          <div className="rail-bottom">
            {" "}
            <Button
              className="desktop-sidebar-toggle"
              variant="ghost"
              size={40}
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              aria-controls={
                view === "connections"
                  ? "available-connections"
                  : "conversation-history"
              }
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="M9 4v16" />
              </svg>
            </Button>
            <div className="sidebar-bottom">
              <ActionMenu
                label="Account"
                iconOnly
                className="account-menu"
                icon={
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="9" r="3" />
                    <path d="M5 18c1-6 13-6 14 0" />
                  </svg>
                }
              >
                <p className="account-email">{email}</p>
                <p className="account-provider">{providerLabel}</p>
                {onAccess && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSidebarOpen(false);
                      onAccess();
                    }}
                  >
                    People
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSidebarOpen(false);
                    onSessions();
                  }}
                >
                  Sessions
                </Button>
                <Button
                  variant="ghost"
                  onClick={onDisconnect}
                  disabled={pending}
                >
                  Sign out
                </Button>
              </ActionMenu>
            </div>
          </div>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-brand">
            <Brand />
          </div>
          {view !== "connections" && (
            <Button
              size={40}
              variant="ghost"
              className="new-chat-button"
              onClick={() => {
                setSidebarOpen(false);
                onCreate();
              }}
              disabled={pending}
              aria-label="New conversation"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M16 3l5 5-10 10-5 1 1-5Z" />
              </svg>
              <span className="new-chat-label">New chat</span>
            </Button>
          )}
          <SidebarList
            id={
              view === "connections"
                ? "available-connections"
                : "conversation-history"
            }
            label={
              view === "connections"
                ? "Available connections"
                : "Conversation history"
            }
            searchLabel={
              view === "connections" ? "Search connections" : "Search chats"
            }
            search={view === "connections" ? connectionSearch : search}
            onSearch={view === "connections" ? setConnectionSearch : setSearch}
            emptyMessage={
              view === "connections"
                ? "No connections available."
                : "No conversations yet."
            }
            noMatchesMessage={
              view === "connections"
                ? "No matching connections."
                : "No matching chats."
            }
            items={
              view === "connections"
                ? connectionItems.map((connection) => ({
                    id: connection.id,
                    title: connection.name,
                    selected: selectedConnection === connection.id,
                    onSelect: () => {
                      setSidebarOpen(false);
                      onSelectConnection(connection.id);
                    },
                  }))
                : conversations.map((conversation) => ({
                    id: conversation.id,
                    title: conversation.title,
                    selected: currentId === conversation.id,
                    disabled: pending,
                    onSelect: () => {
                      setSidebarOpen(false);
                      onSelect(conversation.id);
                    },
                    action: (
                      <Button
                        variant="ghost"
                        size={40}
                        className="manage-chat-button"
                        aria-label={`Manage chat: ${conversation.title}`}
                        disabled={pending}
                        onClick={() => {
                          setSidebarOpen(false);
                          onManage(conversation);
                        }}
                      >
                        ···
                      </Button>
                    ),
                  }))
            }
          />
        </div>
      </aside>
    </>
  );
}
