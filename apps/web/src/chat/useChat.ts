import type {
  Conversation,
  InterviewInput,
  ModelSelection,
  StreamEvent,
} from "@panky/shared";
import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import type { Api } from "../api/chat";
import { errorMessage } from "../api/chat";
import { chatReducer, initialChatState, submissionAccepted } from "./chatState";

type History = Awaited<ReturnType<Api["history"]>>;

function providerLabel(health: Awaited<ReturnType<Api["health"]>>) {
  return health.provider === "mock"
    ? "Demo mode"
    : `Local AI · ${health.model}`;
}

export function useChat(api: Api, modelSelection?: ModelSelection) {
  const [label, setProviderLabel] = useState("Connecting");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = current?.id ?? "new";
  const draft = drafts[draftKey] ?? "";
  function setDraft(value: string) {
    setDrafts((items) => ({ ...items, [draftKey]: value }));
  }
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const cancelLock = useRef(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const lock = useRef(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const replaceHistoryContent = useCallback((history: History | null) => {
    dispatch({ type: "history-replaced", history });
  }, []);
  const applyHistory = useCallback(
    (history: History | null) => {
      setCurrent(history?.conversation ?? null);
      replaceHistoryContent(history);
    },
    [replaceHistoryContent],
  );

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (lock.current || cancelLock.current) return false;
    lock.current = true;
    dispatch({ type: "operation-started" });
    try {
      await operation();
      return true;
    } catch (cause) {
      if (mounted.current)
        dispatch({ type: "error", error: errorMessage(cause) });
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) dispatch({ type: "operation-finished" });
    }
  }, []);

  const refresh = useCallback(
    (id?: string) =>
      run(async () => {
        const [list, health] = await Promise.all([
          api.conversations(),
          api.health(),
        ]);
        const selected = list.find((item) => item.id === id)?.id;
        const history = selected ? await api.history(selected) : null;
        if (!mounted.current) return;
        setConversations(list);
        applyHistory(history);
        setServerBusy(health.busy);
        setProviderLabel(providerLabel(health));
        setConnected(true);
      }),
    [api, run, applyHistory],
  );

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const timer = setInterval(() => {
      void api
        .health()
        .then((health) => {
          if (alive) {
            setServerBusy(health.busy);
            setProviderLabel(providerLabel(health));
            setConnected(true);
          }
        })
        .catch(() => {
          if (alive) setConnected(false);
        });
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [api]);

  function select(id: string) {
    return run(async () => {
      const history = await api.history(id);
      if (!mounted.current) return;
      applyHistory(history);
    });
  }

  function create() {
    if (lock.current || cancelLock.current) return;
    applyHistory(null);
    dispatch({ type: "error", error: "" });
  }

  function rename(id: string, title: string) {
    return run(async () => {
      const updated = await api.rename(id, title);
      if (!mounted.current) return;
      setConversations((items) => [
        updated,
        ...items.filter((item) => item.id !== id),
      ]);
      setCurrent((item) => (item?.id === id ? updated : item));
    });
  }
  function remove(id: string) {
    return run(async () => {
      await api.remove(id);
      if (!mounted.current) return;
      setConversations((items) => items.filter((item) => item.id !== id));
      setDrafts((items) => {
        const next = { ...items };
        delete next[id];
        return next;
      });
      if (current?.id === id) {
        applyHistory(null);
      }
    });
  }
  function send(
    content: string,
    {
      interview,
      onAccepted,
      useSources = false,
    }: {
      interview?: InterviewInput;
      onAccepted?: (messages: {
        userMessageId: string;
        assistantMessageId: string;
      }) => void;
      useSources?: boolean;
    } = {},
  ) {
    return run(async () => {
      const conversation = current ?? (await api.create());
      if (!mounted.current) return;
      if (!current) {
        setDrafts((items) => {
          const next = { ...items, [conversation.id]: items.new ?? content };
          delete next.new;
          return next;
        });
        setCurrent(conversation);
        setConversations((list) => [conversation, ...list]);
      }
      const controller = new AbortController();
      active.current = controller;
      dispatch({ type: "stream-opened" });
      let accepted = false;
      const receive = (event: StreamEvent) => {
        if (!mounted.current) return;
        if (event.type === "start") {
          if (accepted) return;
          accepted = true;
          onAccepted?.({
            userMessageId: event.user.id,
            assistantMessageId: event.assistant.id,
          });
          setDrafts((items) => {
            const next = { ...items };
            delete next[conversation.id];
            return next;
          });
        }
        if (event.type === "done") setServerBusy(false);
        dispatch({ type: "stream-event", event });
      };
      try {
        await api.send(
          conversation.id,
          content,
          controller.signal,
          receive,
          interview,
          useSources,
          modelSelection,
        );
        const list = await api.conversations();
        if (mounted.current) {
          setConversations(list);
          setCurrent(
            list.find((item) => item.id === conversation.id) ?? conversation,
          );
        }
      } catch (cause) {
        if (mounted.current) {
          dispatch({ type: "stream-interrupted" });
        }
        throw cause;
      } finally {
        active.current = null;
        if (mounted.current) {
          dispatch({ type: "stream-closed" });
        }
      }
    });
  }
  async function cancel(id: string) {
    if (cancelLock.current || (lock.current && !active.current)) return;
    cancelLock.current = true;
    dispatch({ type: "cancel-started" });
    try {
      const { run: task } = await api.cancel(id);
      if (!mounted.current) return;
      if (task.status !== "running") setServerBusy(false);
      dispatch({ type: "cancel-result", run: task });
      if (!active.current && current) {
        const history = await api.history(current.id);
        if (!mounted.current) return;
        replaceHistoryContent(history);
      }
    } catch (cause) {
      if (mounted.current)
        dispatch({ type: "error", error: errorMessage(cause) });
    } finally {
      cancelLock.current = false;
      if (mounted.current) dispatch({ type: "cancel-finished" });
    }
  }
  return {
    providerLabel: modelSelection ? `ChatGPT · ${modelSelection.model}` : label,
    localProviderLabel: label,
    draft,
    setDraft,
    conversations,
    current,
    messages: state.messages,
    runs: state.runs,
    activities: state.activities,
    cancelling: state.cancelling,
    cancel,
    pending: state.operation.phase !== "idle" || state.cancelling,
    streaming: state.operation.phase === "stream",
    submissionAccepted: submissionAccepted(state.operation),
    serverBusy,
    connected,
    error: state.error,
    refresh,
    select,
    create,
    send,
    rename,
    remove,
    clearError: () => dispatch({ type: "error", error: "" }),
  };
}
