import { Button, TextField } from "@jack.winter/pancake-ui";
import type { Conversation } from "@panky/shared";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { ActionMenu } from "../components/ActionMenu";
import { Brand } from "../components/Brand";

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
}) {
  const [search, setSearch] = useState("");
  const visibleConversations = conversations.filter((item) =>
    item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
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
        aria-label="Conversations"
      >
        <div className="sidebar-brand">
          <Brand />
          <Button
            className="desktop-sidebar-toggle"
            variant="ghost"
            size={40}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="conversation-history"
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
          <Button
            className="mobile-menu sidebar-close"
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations"
            title="Close conversations"
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
        </div>
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
        <div className="chat-search">
          <TextField
            label="Search chats"
            placeholder="Search chats"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
        <nav
          id="conversation-history"
          className="conversation-list"
          aria-label="Conversation history"
        >
          {conversations.length === 0 && (
            <p className="muted sidebar-empty">No conversations yet.</p>
          )}
          {conversations.length > 0 && visibleConversations.length === 0 && (
            <p className="muted sidebar-empty">No matching chats.</p>
          )}
          {visibleConversations.map((conversation) => (
            <div className="conversation-row" key={conversation.id}>
              <button
                type="button"
                className="conversation-link"
                aria-current={
                  currentId === conversation.id ? "page" : undefined
                }
                disabled={pending}
                onClick={() => {
                  setSidebarOpen(false);
                  onSelect(conversation.id);
                }}
              >
                <span>{conversation.title}</span>
              </button>
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
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ActionMenu label="Account" className="account-menu">
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
            <Button variant="ghost" onClick={onDisconnect} disabled={pending}>
              Sign out
            </Button>
          </ActionMenu>
        </div>
      </aside>
    </>
  );
}
