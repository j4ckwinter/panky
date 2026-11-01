import {
  BannerToast,
  Button,
  Inline,
  LoadingIndicator,
  StatusChip,
  Text,
  Textarea,
} from "@jack.winter/pancake-ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Api } from "./api";
import { Brand } from "./Brand";
import { PankyMark } from "./PankyMark";
import { TaskActivity } from "./TaskActivity";
import { useChat } from "./useChat";

export function Chat({
  api,
  onDisconnect,
}: {
  api: Api;
  onDisconnect: () => void;
}) {
  const chat = useChat(api);
  const { draft, setDraft } = chat;
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    const resize = () => {
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight}px`;
    };
    resize();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === width) return;
      width = field.clientWidth;
      resize();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [draft]);
  const composerStatus = !chat.connected
    ? "Connection lost. Refresh history to reconnect."
    : chat.serverBusy && !chat.streaming
      ? "Another tab is running a task. Wait for it to finish."
      : "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const panel = sidebar.current;
    const trigger = menu.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
          [],
      );
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
  }, [sidebarOpen]);
  const scrollArea = useRef<HTMLDivElement>(null);
  const scrollContent = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const lastMessage = chat.messages.at(-1);
  const latestRun = chat.runs.at(-1);
  const conversationId = chat.current?.id;
  const hasMessages = chat.messages.length > 0;
  useLayoutEffect(() => {
    following.current = true;
    setShowJump(false);
    const area = scrollArea.current;
    if (area) area.scrollTop = hasMessages ? area.scrollHeight : 0;
  }, [conversationId, hasMessages]);
  useLayoutEffect(() => {
    const area = scrollArea.current;
    const content = scrollContent.current;
    if (!area || !content) return;
    const observer = new ResizeObserver(() => {
      if (following.current) {
        area.scrollTop = hasMessages ? area.scrollHeight : 0;
      } else if (area.scrollHeight - area.scrollTop - area.clientHeight < 48) {
        following.current = true;
        setShowJump(false);
      }
    });
    observer.observe(content);
    observer.observe(area);
    return () => observer.disconnect();
  }, [hasMessages]);
  function jumpToLatest() {
    following.current = true;
    setShowJump(false);
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }
  const unavailable = chat.pending || chat.serverBusy || !chat.connected;
  return (
    <div className="chat-layout">
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
            className="mobile-menu"
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations"
          >
            Close
          </Button>
        </div>
        <Button
          size={40}
          variant="ghost"
          className="new-chat-button"
          onClick={() => {
            setSidebarOpen(false);
            void chat.create();
          }}
          disabled={chat.pending}
          aria-label="New conversation"
        >
          <span aria-hidden="true">＋</span> New chat
        </Button>
        <div className="sidebar-heading">Chats</div>
        <nav className="conversation-list" aria-label="Conversation history">
          {chat.conversations.length === 0 && (
            <p className="muted sidebar-empty">No conversations yet.</p>
          )}
          {chat.conversations.map((conversation) => (
            <button
              type="button"
              className="conversation-link"
              key={conversation.id}
              aria-current={
                chat.current?.id === conversation.id ? "page" : undefined
              }
              disabled={chat.pending}
              onClick={() => {
                setSidebarOpen(false);
                void chat.select(conversation.id);
              }}
            >
              <span>{conversation.title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <StatusChip tone="warning" title="Replies are simulated.">
            Demo mode
          </StatusChip>
          <Button
            variant="secondary"
            className="disconnect-button"
            onClick={onDisconnect}
            disabled={chat.pending}
          >
            Disconnect
          </Button>
        </div>
      </aside>
      <main className="chat-main" inert={sidebarOpen}>
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
              onClick={() => setSidebarOpen(!sidebarOpen)}
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
              {chat.current?.title ?? "New chat"}
            </Text>
          </div>
          <Inline gap="space12" className="chat-header-actions">
            <span
              className={`connection ${!chat.connected ? "offline" : !chat.streaming && !chat.serverBusy ? "connection-idle" : ""}`}
              title={chat.connected ? "Connected" : "Connection lost"}
            >
              <span aria-hidden="true" />
              <span className="connection-label">
                {!chat.connected
                  ? "Connection lost"
                  : chat.streaming
                    ? "Replying"
                    : chat.serverBusy
                      ? "Busy in another tab"
                      : "Connected"}
              </span>
            </span>
            <Button
              variant="ghost"
              className="header-icon-button"
              size={40}
              aria-label="Refresh history"
              title="Refresh history"
              onClick={() => void chat.refresh(chat.current?.id)}
              disabled={chat.pending}
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
                <path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6M20 7l-3-3" />
              </svg>
            </Button>
          </Inline>
        </header>
        {chat.error && (
          <div className="chat-alert">
            <BannerToast tone="error" title="Could not complete request">
              {chat.error}
            </BannerToast>
          </div>
        )}
        <div className={`chat-body${hasMessages ? "" : " chat-body-empty"}`}>
          <div
            className="chat-scroll"
            ref={scrollArea}
            onScroll={(event) => {
              const area = event.currentTarget;
              const nearBottom =
                area.scrollHeight - area.scrollTop - area.clientHeight < 48;
              following.current = nearBottom;
              setShowJump(!nearBottom);
            }}
          >
            <div ref={scrollContent}>
              {chat.messages.length === 0 ? (
                <section className="welcome">
                  <span className="welcome-mark" aria-hidden="true">
                    p<span>✳</span>
                  </span>
                  <h2>Start a chat</h2>
                </section>
              ) : (
                <div className="message-list" aria-label="Messages">
                  {chat.messages.map((message) => {
                    const task = chat.runs.find(
                      (run) => run.assistantMessageId === message.id,
                    );
                    return (
                      <article
                        key={message.id}
                        className={`message message-${message.role}`}
                        aria-label={
                          message.role === "user"
                            ? "Your message"
                            : "Panky response"
                        }
                      >
                        {message.role === "assistant" && (
                          <div className="message-meta">
                            <PankyMark small />
                            <strong>Panky</strong>
                          </div>
                        )}
                        <div className="message-content">
                          {message.content ||
                            (message.status === "streaming"
                              ? "Preparing reply…"
                              : "No reply text was saved.")}
                        </div>
                        {message.status === "interrupted" && (
                          <p className="interrupted">
                            {task?.status === "cancelled"
                              ? "Task cancelled. Any partial reply was saved."
                              : task?.status === "failed"
                                ? "Task failed. See task activity for details."
                                : "Reply interrupted. This partial reply was saved; nothing was retried."}
                          </p>
                        )}
                        {message.status === "streaming" && (
                          <p className="streaming-label">
                            {chat.streaming
                              ? "Replying…"
                              : "Reply in progress. Refresh history to check for updates."}
                          </p>
                        )}
                        {task && (
                          <TaskActivity
                            task={task}
                            activities={chat.activities}
                            cancelling={chat.cancelling}
                            onCancel={(id) => void chat.cancel(id)}
                          />
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="composer-area">
            {showJump && (
              <div className="jump-to-latest">
                <Button variant="secondary" onClick={jumpToLatest}>
                  Jump to latest ↓
                </Button>
              </div>
            )}
            {chat.pending && (
              <LoadingIndicator
                label={
                  chat.streaming
                    ? "Panky is replying…"
                    : "Loading conversation…"
                }
              />
            )}
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (!unavailable && draft.trim()) void chat.send(draft.trim());
              }}
            >
              <Textarea
                ref={input}
                label="Message"
                rows={1}
                maxLength={8000}
                value={draft}
                placeholder="Message Panky"
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  )
                    return;
                  event.preventDefault();
                  if (!event.repeat) event.currentTarget.form?.requestSubmit();
                }}
                aria-describedby={composerStatus ? "composer-help" : undefined}
                disabled={chat.pending}
              />
              <Button
                className="send-button"
                size={48}
                type="submit"
                disabled={unavailable || !draft.trim()}
                aria-label="Send message"
                title="Send message"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </Button>
            </form>
            {composerStatus && (
              <p id="composer-help" className="composer-status" role="status">
                {composerStatus}
              </p>
            )}
            {(chat.error ||
              !chat.connected ||
              (lastMessage?.status === "interrupted" &&
                latestRun?.status !== "cancelled" &&
                latestRun?.status !== "failed")) && (
              <p className="composer-note">
                Refresh history before sending again. Your messages are never
                retried automatically.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
