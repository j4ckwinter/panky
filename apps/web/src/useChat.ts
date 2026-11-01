import type {
  Activity,
  Conversation,
  Message,
  StreamEvent,
  TaskRun,
} from "@panky/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Api } from "./api";
import { errorMessage } from "./api";

export function useChat(api: Api) {
  const [providerLabel, setProviderLabel] = useState("Connecting");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = current?.id ?? "new";
  const draft = drafts[draftKey] ?? "";
  function setDraft(value: string) {
    setDrafts((items) => ({ ...items, [draftKey]: value }));
  }
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const cancelLock = useRef(false);
  const [pending, setPending] = useState(false);
  const [submissionAccepted, setSubmissionAccepted] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (lock.current || cancelLock.current) return false;
    lock.current = true;
    setPending(true);
    setSubmissionAccepted(false);
    setError("");
    try {
      await operation();
      return true;
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
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
        setCurrent(history?.conversation ?? null);
        setMessages(history?.messages ?? []);
        setRuns(history?.runs ?? []);
        setActivities(history?.activities ?? []);
        setServerBusy(health.busy);
        setProviderLabel(
          health.provider === "mock"
            ? "Demo mode"
            : `Local AI · ${health.model}`,
        );
        setConnected(true);
      }),
    [api, run],
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
            setProviderLabel(
              health.provider === "mock"
                ? "Demo mode"
                : `Local AI · ${health.model}`,
            );
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
      setCurrent(history.conversation);
      setMessages(history.messages);
      setRuns(history.runs);
      setActivities(history.activities);
    });
  }

  function create() {
    if (lock.current || cancelLock.current) return;
    setCurrent(null);
    setMessages([]);
    setRuns([]);
    setActivities([]);
    setError("");
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
        setCurrent(null);
        setMessages([]);
        setRuns([]);
        setActivities([]);
      }
    });
  }
  function send(content: string) {
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
      setStreaming(true);
      let assistantId: string | undefined;
      let runId: string | undefined;
      const receive = (event: StreamEvent) => {
        if (!mounted.current) return;
        switch (event.type) {
          case "start":
            setSubmissionAccepted(true);
            assistantId = event.assistant.id;
            runId = event.run.id;
            setRuns((items) => [...items, event.run]);
            setMessages((items) => [...items, event.user, event.assistant]);
            setDrafts((items) => {
              const next = { ...items };
              delete next[conversation.id];
              return next;
            });
            break;
          case "delta":
            setMessages((items) =>
              items.map((item) =>
                item.id === assistantId
                  ? { ...item, content: item.content + event.text }
                  : item,
              ),
            );
            break;
          case "activity":
            setActivities((items) =>
              items.some((item) => item.id === event.activity.id)
                ? items
                : [...items, event.activity],
            );
            break;
          case "done":
            setServerBusy(false);
            setRuns((items) =>
              items.map((item) =>
                item.id === event.run.id ? event.run : item,
              ),
            );
            if (event.run.error && event.run.status !== "cancelled")
              setError(event.run.error);
            setMessages((items) =>
              items.map((item) =>
                item.id === event.message.id ? event.message : item,
              ),
            );
            break;
          case "error":
            setError(event.error);
            break;
        }
      };
      try {
        await api.send(conversation.id, content, controller.signal, receive);
        const list = await api.conversations();
        if (mounted.current) {
          setConversations(list);
          setCurrent(
            list.find((item) => item.id === conversation.id) ?? conversation,
          );
        }
      } catch (cause) {
        if (mounted.current) {
          setRuns((items) =>
            items.map((item) =>
              item.id === runId && item.status === "running"
                ? {
                    ...item,
                    status: "interrupted",
                    error:
                      "Connection interrupted. Refresh history to confirm the saved task status.",
                  }
                : item,
            ),
          );
          setMessages((items) =>
            items.map((item) =>
              item.id === assistantId && item.status === "streaming"
                ? { ...item, status: "interrupted" }
                : item,
            ),
          );
        }
        throw cause;
      } finally {
        active.current = null;
        if (mounted.current) {
          setStreaming(false);
        }
      }
    });
  }
  async function cancel(id: string) {
    if (cancelLock.current || (lock.current && !active.current)) return;
    cancelLock.current = true;
    setCancelling(true);
    try {
      const { run: task } = await api.cancel(id);
      if (!mounted.current) return;
      if (task.status !== "running") setServerBusy(false);
      setRuns((items) =>
        items.map((item) => (item.id === task.id ? task : item)),
      );
      if (!active.current && current) {
        const history = await api.history(current.id);
        if (!mounted.current) return;
        setMessages(history.messages);
        setRuns(history.runs);
        setActivities(history.activities);
      }
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      cancelLock.current = false;
      if (mounted.current) setCancelling(false);
    }
  }
  return {
    providerLabel,
    draft,
    setDraft,
    conversations,
    current,
    messages,
    runs,
    activities,
    cancelling,
    cancel,
    pending: pending || cancelling,
    streaming,
    submissionAccepted,
    serverBusy,
    connected,
    error,
    refresh,
    select,
    create,
    send,
    rename,
    remove,
    clearError: () => setError(""),
  };
}
