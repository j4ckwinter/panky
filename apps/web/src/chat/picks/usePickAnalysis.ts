import type { PickMessage } from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../../api/chat";

export function usePickAnalysis(api: Api, fixtureId: string) {
  const [messages, setMessages] = useState<PickMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [refresh, setRefresh] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const load = new AbortController();
    setLoading(true);
    setError("");
    void api
      .pickAnalysis(fixtureId, load.signal)
      .then((result) => {
        if (!load.signal.aborted) setMessages(result.messages);
      })
      .catch((cause: unknown) => {
        if (!load.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!load.signal.aborted) setLoading(false);
      });
    return () => {
      load.abort();
      controller.current?.abort();
    };
  }, [api, fixtureId, refresh]);

  async function ask(question: string) {
    if (controller.current || loading || !question.trim()) return;
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    setError("");
    try {
      const result = await api.explainPick(
        fixtureId,
        question.trim(),
        request.signal,
      );
      if (!request.signal.aborted) {
        setMessages(result.messages);
        setDraft("");
      }
    } catch (cause) {
      setError(
        request.signal.aborted
          ? "Explanation stopped. Refresh analysis to see the saved response. Nothing will be sent again automatically."
          : errorMessage(cause),
      );
    } finally {
      controller.current = null;
      setPending(false);
    }
  }
  return {
    messages,
    loading,
    pending,
    error,
    draft,
    setDraft,
    ask,
    cancel: () => controller.current?.abort(),
    reload: () => setRefresh((value) => value + 1),
  };
}
