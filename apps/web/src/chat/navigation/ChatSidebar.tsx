import { Button } from "@jack.winter/pancake-ui";
import type { Conversation } from "@panky/shared";
import {
  type Dispatch,
  type RefObject,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { FeatureNavigation, type ChatView } from "./FeatureNavigation";
import { Brand } from "../../components/Brand";
import type {
  ConnectionId,
  ConnectionItem,
} from "../connections/connection-catalogue";
import { SidebarList } from "./SidebarList";

export function ChatSidebar({
  accountMenu,
  onNavigate,
  conversations,
  currentId,
  pending,
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  setSidebarCollapsed,
  menu,
  onCreate,
  onSelect,
  onManage,
  view,
  selectedConnection,
  connectionItems,
  onSelectConnection,
}: {
  accountMenu: ReactNode;
  onNavigate: (view: ChatView) => void;
  conversations: Conversation[];
  currentId?: string;
  pending: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  menu: RefObject<HTMLButtonElement | null>;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onManage: (conversation: Conversation) => void;
  view: ChatView;
  selectedConnection: ConnectionId | null;
  connectionItems: ConnectionItem[];
  onSelectConnection: (id: ConnectionId) => void;
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
          view === "picks"
            ? "Picks navigation"
            : view === "connections"
              ? "Connections navigation"
              : "Conversations"
        }
      >
        <div className="feature-rail">
          <Button
            className="mobile-menu sidebar-close"
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            aria-label={
              view === "picks"
                ? "Close picks"
                : view === "connections"
                  ? "Close connections"
                  : "Close conversations"
            }
            title={
              view === "picks"
                ? "Close picks"
                : view === "connections"
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
          <FeatureNavigation
            view={view}
            pending={pending}
            onNavigate={(next) => {
              setSidebarOpen(false);
              onNavigate(next);
            }}
          />
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
                view === "picks"
                  ? "picks-navigation"
                  : view === "connections"
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
            {accountMenu}
          </div>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-brand">
            <Brand />
          </div>
          {(view === "chat" || view === "interview") && (
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
          {view === "picks" ? (
            <section id="picks-navigation" className="picks-sidebar">
              <strong>Weekend football</strong>
              <p>
                Explore match probabilities and ask Panky about the evidence.
              </p>
              <p>Preview · sample data</p>
            </section>
          ) : (
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
              onSearch={
                view === "connections" ? setConnectionSearch : setSearch
              }
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
          )}
        </div>
      </aside>
    </>
  );
}
