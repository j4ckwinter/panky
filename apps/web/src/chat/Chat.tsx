import { BannerToast } from "@jack.winter/pancake-ui";
import type { Conversation } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import type { Api } from "../api/chat";
import { ManageChat } from "./ManageChat";
import { ChatSidebar, type ChatView } from "./ChatSidebar";
import { ChatHeader } from "./ChatHeader";
import { ChatComposer } from "./ChatComposer";
import { MessageList } from "./MessageList";
import { useChat } from "./useChat";
import { useChatScroll } from "./useChatScroll";
import { Interview } from "./Interview";
import { Connections, type ConnectionReturn } from "./Connections";

function initialView(): ChatView {
  return new URLSearchParams(window.location.search).get("view") ===
    "connections"
    ? "connections"
    : "chat";
}

function initialConnectionReturn(): ConnectionReturn {
  const result = new URLSearchParams(window.location.search).get("notion");
  return result === "connected" || result === "denied" || result === "error"
    ? result
    : null;
}

export function Chat({
  api,
  onDisconnect,
  onSessions,
  onAccess,
  email,
}: {
  api: Api;
  onDisconnect: () => void;
  onSessions: () => void;
  onAccess?: () => void;
  email: string;
}) {
  const chat = useChat(api);
  const input = useRef<HTMLTextAreaElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const [managedChat, setManagedChat] = useState<Conversation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toolsTarget, setToolsTarget] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<ChatView>(initialView);
  const [connectionReturn, setConnectionReturn] = useState(
    initialConnectionReturn,
  );
  const interview = view === "interview";
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "connections") url.searchParams.set("view", "connections");
    else url.searchParams.delete("view");
    url.searchParams.delete("notion");
    window.history.replaceState(window.history.state, "", url);
  }, [view]);
  const hasMessages = chat.messages.length > 0;
  const { scrollArea, scrollContent, showJump, jumpToLatest, onScroll } =
    useChatScroll(chat.current?.id, hasMessages && view === "chat");
  const lastMessage = chat.messages.at(-1);
  const latestRun = chat.runs.at(-1);
  const runningTask = chat.runs.find((task) => task.status === "running");
  const showRecoveryNote = Boolean(
    chat.error ||
      !chat.connected ||
      (lastMessage?.status === "interrupted" &&
        latestRun?.status !== "cancelled" &&
        latestRun?.status !== "failed"),
  );
  return (
    <div
      className={`chat-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
    >
      {managedChat && (
        <ManageChat
          conversation={managedChat}
          pending={chat.pending}
          error={chat.error}
          onRename={(title) => chat.rename(managedChat.id, title)}
          onDelete={() => chat.remove(managedChat.id)}
          onClose={() => {
            setManagedChat(null);
            if (window.matchMedia("(max-width: 640px)").matches)
              menu.current?.focus();
          }}
        />
      )}
      <ChatSidebar
        conversations={chat.conversations}
        currentId={view === "chat" ? chat.current?.id : undefined}
        view={view}
        onChat={() => {
          setView("chat");
          setConnectionReturn(null);
        }}
        onInterview={() => {
          if (interview) return;
          chat.create();
          setView("interview");
          setConnectionReturn(null);
        }}
        onConnections={() => setView("connections")}
        pending={chat.pending}
        providerLabel={chat.providerLabel}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        menu={menu}
        email={email}
        onCreate={() => {
          setView("chat");
          setConnectionReturn(null);
          chat.create();
        }}
        onSelect={(id) => {
          setView("chat");
          setConnectionReturn(null);
          void chat.select(id);
        }}
        onManage={(conversation) => {
          chat.clearError();
          setManagedChat(conversation);
        }}
        onAccess={onAccess}
        onSessions={onSessions}
        onDisconnect={onDisconnect}
      />
      <main className="chat-main" inert={sidebarOpen}>
        <ChatHeader
          toolsSlot={
            interview ? (
              <div className="interview-header-tools" ref={setToolsTarget} />
            ) : undefined
          }
          title={
            view === "connections"
              ? "Connections"
              : interview
                ? "Interview assistant"
                : (chat.current?.title ?? "New chat")
          }
          connected={chat.connected}
          streaming={chat.streaming}
          serverBusy={chat.serverBusy}
          pending={chat.pending}
          showChatActions={view !== "connections"}
          sidebarOpen={sidebarOpen}
          menu={menu}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onRefresh={() => {
            void chat.refresh(chat.current?.id);
          }}
          onCreate={() => {
            setView("chat");
            chat.create();
            input.current?.focus();
          }}
        />
        {chat.error && (
          <div className="chat-alert">
            <BannerToast tone="error" title="Could not complete request">
              {chat.error}
            </BannerToast>
          </div>
        )}
        {view === "connections" ? (
          <Connections
            api={api}
            returnResult={connectionReturn}
            clearReturn={() => setConnectionReturn(null)}
          />
        ) : interview ? (
          <Interview chat={chat} api={api} toolsTarget={toolsTarget} />
        ) : (
          <div className={`chat-body${hasMessages ? "" : " chat-body-empty"}`}>
            <div className="chat-scroll" ref={scrollArea} onScroll={onScroll}>
              <div ref={scrollContent}>
                <MessageList
                  messages={chat.messages}
                  runs={chat.runs}
                  activities={chat.activities}
                  streaming={chat.streaming}
                />
              </div>
            </div>
            <ChatComposer
              input={input}
              draft={chat.draft}
              setDraft={chat.setDraft}
              connected={chat.connected}
              serverBusy={chat.serverBusy}
              streaming={chat.streaming}
              pending={chat.pending}
              submissionAccepted={chat.submissionAccepted}
              cancelling={chat.cancelling}
              runningTask={runningTask}
              showJump={showJump}
              jumpToLatest={jumpToLatest}
              showRecoveryNote={showRecoveryNote}
              onSend={(content) => {
                void chat.send(content);
              }}
              onCancel={(id) => {
                void chat.cancel(id);
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
