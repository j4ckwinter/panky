import { useCallback, useEffect, useRef, useState } from "react";
import type { Api } from "../api/chat";
import { errorMessage } from "../api/chat";

type Connection = Awaited<ReturnType<Api["chatGPTConnection"]>>;
type Models = Awaited<ReturnType<Api["chatGPTModels"]>>["models"];
export function useChatGPT(api: Api, owner: boolean) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [models, setModels] = useState<Models>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!owner || active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api.chatGPTConnection();
      if (!mounted.current) return;
      setConnection(next);
      setModels([]);
      if (next.kind === "connected") {
        const result = await api.chatGPTModels();
        if (mounted.current) setModels(result.models);
      }
    } catch (cause) {
      if (mounted.current) {
        setModels([]);
        setError(errorMessage(cause));
      }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [api, owner]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  async function disconnect() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await api.disconnectChatGPT();
      if (mounted.current) {
        setConnection({ kind: "disconnected" });
        setModels([]);
      }
    } catch (cause) {
      if (mounted.current) {
        setModels([]);
        setError(errorMessage(cause));
      }
      try {
        const current = await api.chatGPTConnection();
        if (mounted.current) setConnection(current);
      } catch {
        if (mounted.current) setConnection(null);
      }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { connection, models, busy, error, refresh, disconnect };
}
export type ChatGPTState = ReturnType<typeof useChatGPT>;
