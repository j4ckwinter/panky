import { BannerToast } from "@jack.winter/pancake-ui";
import type { Conversation, ModelSelection } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import type { Api } from "../api/chat";
import { ChatComposer } from "./composer/ChatComposer";
import { type ConnectionReturn, Connections } from "./connections/Connections";
import {
  type ConnectionId,
  connectionCatalogue,
} from "./connections/connection-catalogue";
import { Interview } from "./interview/Interview";
import { MessageList } from "./messages/MessageList";
import { useChatScroll } from "./messages/useChatScroll";
import { ModelNotice, ModelPicker } from "./models/ModelPicker";
import { useChatGPT } from "./models/useChatGPT";
import { AccountMenu } from "./navigation/AccountMenu";
import { ChatHeader } from "./navigation/ChatHeader";
import { ChatSidebar } from "./navigation/ChatSidebar";
import type { ChatView } from "./navigation/FeatureNavigation";
import { ManageChat } from "./navigation/ManageChat";
import { Picks } from "./picks/Picks";
import { useChat } from "./useChat";

function initialView(): ChatView {
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "connections" || view === "picks" ? view : "chat";
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
  const [modelSelection, setModelSelection] = useState<ModelSelection>();
  const chat = useChat(api, modelSelection);
  const chatGPT = useChatGPT(api, Boolean(onAccess));
  const catalogue = connectionCatalogue(
    Boolean(onAccess) &&
      ((chatGPT.connection !== null &&
        chatGPT.connection.kind !== "unavailable") ||
        Boolean(chatGPT.error)),
  );
  const showModels =
    Boolean(onAccess) && (chatGPT.models.length > 0 || Boolean(modelSelection));
  const modelPicker = showModels ? (
    <ModelPicker
      state={chatGPT}
      value={modelSelection}
      onChange={setModelSelection}
      pending={chat.pending}
      localLabel={chat.localProviderLabel}
    />
  ) : null;
  const modelNotice = showModels ? (
    <ModelNotice state={chatGPT} value={modelSelection} />
  ) : null;
  const [interviewSession, setInterviewSession] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const [managedChat, setManagedChat] = useState<Conversation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<ChatView>(initialView);
  const [connectionReturn, setConnectionReturn] = useState(
    initialConnectionReturn,
  );
  const [selectedConnection, setSelectedConnection] =
    useState<ConnectionId | null>(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("connection") === "chatgpt" && onAccess) return "chatgpt";
      return params.get("connection") === "notion" || initialConnectionReturn()
        ? "notion"
        : null;
    });
  const interview = view === "interview";
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "connections" || view === "picks")
      url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    if (view === "connections" && selectedConnection)
      url.searchParams.set("connection", selectedConnection);
    else url.searchParams.delete("connection");
    url.searchParams.delete("notion");
    window.history.replaceState(window.history.state, "", url);
  }, [view, selectedConnection]);
  function openChat() {
    setInterviewSession(false);
    setView("chat");
    setConnectionReturn(null);
  }
  function openInterview() {
    if (interview || chat.pending) return;
    const returning = view === "connections" && interviewSession;
    if (!returning) {
      chat.create();
    }
    setInterviewSession(true);
    setView("interview");
    setConnectionReturn(null);
  }
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
        onNavigate={(next) => {
          if (next === "chat") openChat();
          else if (next === "interview") openInterview();
          else if (next === "picks") setView("picks");
          else {
            setSelectedConnection(null);
            setConnectionReturn(null);
            setView("connections");
          }
        }}
        selectedConnection={selectedConnection}
        connectionItems={catalogue}
        onSelectConnection={(id) => {
          setSelectedConnection(id);
          setView("connections");
        }}
        pending={chat.pending}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        menu={menu}
        onCreate={() => {
          openChat();
          chat.create();
        }}
        onSelect={(id) => {
          openChat();
          void chat.select(id);
        }}
        onManage={(conversation) => {
          chat.clearError();
          setManagedChat(conversation);
        }}
        accountMenu={
          <AccountMenu
            email={email}
            providerLabel={chat.providerLabel}
            pending={chat.pending}
            onAccess={onAccess}
            onSessions={onSessions}
            onDisconnect={onDisconnect}
            onCloseSidebar={() => setSidebarOpen(false)}
          />
        }
      />
      <main className="chat-main" inert={sidebarOpen}>
        <ChatHeader
          title={
            view === "picks"
              ? "Pancake Picks"
              : view === "connections"
                ? "Connections"
                : interview
                  ? "Interview assistant"
                  : (chat.current?.title ?? "New chat")
          }
          connected={chat.connected}
          streaming={chat.streaming}
          serverBusy={chat.serverBusy}
          pending={chat.pending}
          showChatActions={view === "chat" || interview}
          navigationLabel={view === "picks" ? "Picks navigation" : undefined}
          busyLabel={view === "picks" ? "Panky is busy" : undefined}
          sidebarOpen={sidebarOpen}
          menu={menu}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onRefresh={() => {
            void chat.refresh(chat.current?.id);
          }}
          onCreate={() => {
            openChat();
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
        {view === "picks" ? (
          <Picks api={api} canRefresh={Boolean(onAccess)} />
        ) : view === "connections" ? (
          <Connections
            api={api}
            selectedConnection={selectedConnection}
            catalogue={catalogue}
            chatGPT={chatGPT}
            onSelectConnection={setSelectedConnection}
            returnResult={connectionReturn}
            clearReturn={() => setConnectionReturn(null)}
            pending={chat.pending}
          />
        ) : interview ? (
          <Interview
            chat={chat}
            modelPicker={modelPicker}
            modelNotice={modelNotice}
          />
        ) : (
          <div className={`chat-body${hasMessages ? "" : " chat-body-empty"}`}>
            <div className="chat-scroll" ref={scrollArea} onScroll={onScroll}>
              <div ref={scrollContent}>
                <MessageList
                  messages={chat.messages}
                  runs={chat.runs}
                  streaming={chat.streaming}
                />
              </div>
            </div>
            <ChatComposer
              modelPicker={modelPicker}
              modelNotice={modelNotice}
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
                void chat.send(content, { useSources: true });
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
