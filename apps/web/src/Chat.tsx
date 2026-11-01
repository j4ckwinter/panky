import {
  BannerToast,
  Button,
  Inline,
  LoadingIndicator,
  StatusChip,
  Text,
  Textarea,
} from "@jack.winter/pancake-ui";
import { useEffect, useRef, useState } from "react";
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
  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const lastMessage = chat.messages.at(-1);
  const latestRun = chat.runs.at(-1);
  useEffect(() => {
    if (lastMessage) end.current?.scrollIntoView({ block: "end" });
  }, [lastMessage]);
  const unavailable =
    chat.pending || chat.serverBusy || !chat.current || !chat.connected;
  return (
    <div className="chat-layout">
      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label="Conversations"
      >
        <Brand />
        <Button
          size={48}
          onClick={() => {
            setDraft("");
            setSidebarOpen(false);
            void chat.create();
          }}
          disabled={chat.pending}
          aria-label="New conversation"
        >
          + New conversation
        </Button>
        <div className="sidebar-heading">YOUR CONVERSATIONS</div>
        <nav className="conversation-list" aria-label="Conversation history">
          {chat.conversations.length === 0 && (
            <p className="muted sidebar-empty">
              A fresh page. Start something.
            </p>
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
                setDraft("");
                setSidebarOpen(false);
                void chat.select(conversation.id);
              }}
            >
              <span className="conversation-symbol" aria-hidden="true">
                ↳
              </span>
              <span>{conversation.title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <StatusChip tone="warning">Mock provider</StatusChip>
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
      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-heading">
            <Button
              className="mobile-menu"
              variant="ghost"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              Conversations
            </Button>
            <Text as="h1" variant="heading">
              {chat.current?.title ?? "Your next conversation"}
            </Text>
          </div>
          <Inline gap="space12">
            <span className={`connection ${chat.connected ? "" : "offline"}`}>
              <span aria-hidden="true" />
              {!chat.connected
                ? "Connection lost"
                : chat.streaming
                  ? "Replying"
                  : chat.serverBusy
                    ? "Busy in another tab"
                    : "Connected"}
            </span>
            <Button
              variant="ghost"
              onClick={() => void chat.refresh(chat.current?.id)}
              disabled={chat.pending}
            >
              Refresh history
            </Button>
          </Inline>
        </header>
        {chat.error && (
          <div className="chat-alert">
            <BannerToast tone="error" title="Something needs a moment">
              {chat.error}
            </BannerToast>
          </div>
        )}
        <div className="chat-scroll">
          {chat.messages.length === 0 ? (
            <section className="welcome">
              <span className="welcome-mark" aria-hidden="true">
                p<span>✳</span>
              </span>
              <span className="eyebrow">HERE FOR YOUR NEXT THOUGHT</span>
              <h2>What’s on your mind?</h2>
              <p>
                A question, a half-formed idea, a place to start.
                <br />
                There’s room for it here.
              </p>
              {!chat.current && (
                <Button
                  onClick={() => void chat.create()}
                  disabled={chat.pending}
                >
                  Start a conversation
                </Button>
              )}
              <p className="demo-prompt">
                Try: “What is the current date and time?”
                <br />
                The mock provider can call a real date and time tool.
              </p>
              <StatusChip tone="warning" className="welcome-provider">
                Mock provider
              </StatusChip>
            </section>
          ) : (
            <div className="message-list" aria-label="Messages">
              {chat.messages.map((message) => (
                <article
                  key={message.id}
                  className={`message message-${message.role}`}
                  aria-label={
                    message.role === "user" ? "Your message" : "Panky response"
                  }
                >
                  <div className="message-meta">
                    {message.role === "assistant" ? (
                      <PankyMark small />
                    ) : (
                      <span className="message-avatar user" aria-hidden="true">
                        Y
                      </span>
                    )}
                    <strong>{message.role === "user" ? "You" : "Panky"}</strong>
                    {message.role === "assistant" && (
                      <span className="mock-label">MOCK</span>
                    )}
                  </div>
                  <div className="message-content">
                    {message.content ||
                      (message.status === "streaming"
                        ? "Getting a thought together…"
                        : "No reply text was saved.")}
                  </div>
                  {message.status === "interrupted" && (
                    <p className="interrupted">
                      {chat.runs.find(
                        (task) => task.assistantMessageId === message.id,
                      )?.status === "cancelled"
                        ? "Task cancelled. Any partial reply was saved."
                        : chat.runs.find(
                              (task) => task.assistantMessageId === message.id,
                            )?.status === "failed"
                          ? "Task failed. See task activity for details."
                          : "Reply interrupted. This partial reply was saved; nothing was retried."}
                    </p>
                  )}
                  {message.status === "streaming" && (
                    <p className="streaming-label">
                      {chat.streaming
                        ? "Writing a mock reply…"
                        : "Reply in progress. Refresh history to check for updates."}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
          <TaskActivity
            runs={chat.runs}
            activities={chat.activities}
            cancelling={chat.cancelling}
            onCancel={(id) => void chat.cancel(id)}
          />
          <div ref={end} />
        </div>
        <div className="composer-area">
          {chat.pending && (
            <LoadingIndicator
              label={
                chat.streaming ? "Panky is replying…" : "Loading conversation…"
              }
            />
          )}
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (!unavailable && draft.trim())
                void chat.send(draft.trim(), () => setDraft(""));
            }}
          >
            <Textarea
              label="Message"
              rows={3}
              maxLength={8000}
              value={draft}
              placeholder={
                chat.current
                  ? "Put a thought into words…"
                  : "Start a conversation to say hello…"
              }
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
              disabled={chat.pending || !chat.current}
            />
            <div className="composer-bottom">
              <span>Saved on your backend</span>
              <Button
                type="submit"
                disabled={unavailable || !draft.trim()}
                aria-label="Send message"
              >
                Send message <span aria-hidden="true">↗</span>
              </Button>
            </div>
          </form>
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
      </main>
    </div>
  );
}
