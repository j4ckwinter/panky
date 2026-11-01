import type { Conversation, Message, StreamEvent } from "@panky/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Api } from "./api";
import { errorMessage } from "./api";

export function useChat(api: Api) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
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
        const selected = id ?? list[0]?.id;
        const history = selected ? await api.history(selected) : null;
        if (!mounted.current) return;
        setConversations(list);
        setCurrent(history?.conversation ?? null);
        setMessages(history?.messages ?? []);
        setServerBusy(health.busy);
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
    });
  }

  function create() {
    return run(async () => {
      const conversation = await api.create();
      if (!mounted.current) return;
      setConversations((list) => [conversation, ...list]);
      setCurrent(conversation);
      setMessages([]);
    });
  }

  function send(content: string, onAccepted: () => void) {
    return run(async () => {
      if (!current) return;
      const controller = new AbortController();
      active.current = controller;
      setStreaming(true);
      let assistantId: string | undefined;
      const receive = (event: StreamEvent) => {
        if (!mounted.current) return;
        switch (event.type) {
          case "start":
            assistantId = event.assistant.id;
            setMessages((items) => [...items, event.user, event.assistant]);
            onAccepted();
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
          case "done":
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
        await api.send(current.id, content, controller.signal, receive);
        const list = await api.conversations();
        if (mounted.current) {
          setConversations(list);
          setCurrent(list.find((item) => item.id === current.id) ?? current);
        }
      } catch (cause) {
        if (mounted.current)
          setMessages((items) =>
            items.map((item) =>
              item.id === assistantId && item.status === "streaming"
                ? { ...item, status: "interrupted" }
                : item,
            ),
          );
        throw cause;
      } finally {
        active.current = null;
        if (mounted.current) {
          setStreaming(false);
          setServerBusy(false);
        }
      }
    });
  }
  return {
    conversations,
    current,
    messages,
    pending,
    streaming,
    serverBusy,
    connected,
    error,
    refresh,
    select,
    create,
    send,
  };
}
