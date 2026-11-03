import {
  EXPERIENCE_LIMITS,
  type ExperienceSource,
  type NotionConnection,
} from "@panky/shared";
import { useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../api/chat";

export type PageResult = {
  title: string;
  outcome: "Imported" | "Refreshed" | "Failed";
  error?: string;
};
type Work = {
  title: string;
  action: (signal: AbortSignal) => Promise<unknown>;
};

export function useNotionSources(
  api: Api,
  connected: boolean,
  revision: number,
  disabled: boolean,
  onConnectionChange: (connection: NotionConnection) => void,
  onSourcesChanged: () => void,
) {
  const [sources, setSources] = useState<ExperienceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<PageResult[]>([]);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<Api["notionSourceDetail"]>
  > | null>(null);
  const active = useRef<AbortController | null>(null);
  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setLoading(true);
    setError("");
    setDetail(null);
    void api
      .notionSources(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSources(result.sources);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      active.current?.abort();
    };
  }, [api, connected, revision]);

  useEffect(() => {
    if (disabled) active.current?.abort();
  }, [disabled]);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (
      active.current ||
      disabled ||
      loading ||
      lifetime.current?.signal.aborted
    )
      return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      lifetime.current?.signal ?? controller.signal,
    ]);
    active.current = controller;
    setBusy(true);
    setError("");
    try {
      await action(signal);
    } catch (cause) {
      if (!signal.aborted) setError(errorMessage(cause));
    } finally {
      if (active.current === controller) active.current = null;
      if (!lifetime.current?.signal.aborted) {
        setBusy(false);
        setProgress("");
      }
    }
  }

  async function reload(signal: AbortSignal) {
    const result = await api.notionSources(signal);
    if (!signal.aborted) setSources(result.sources);
  }

  async function batch(items: Work[], outcome: "Imported" | "Refreshed") {
    if (!connected) return;
    await run(async (signal) => {
      setResults([]);
      setDetail(null);
      const bounded = items.slice(0, EXPERIENCE_LIMITS.sources);
      for (const [index, item] of bounded.entries()) {
        if (signal.aborted) break;
        setProgress(
          `${outcome === "Imported" ? "Importing" : "Refreshing"} ${index + 1} of ${bounded.length}: ${item.title}`,
        );
        let failed = false;
        try {
          await item.action(signal);
          if (!signal.aborted) {
            onSourcesChanged();
            setResults((current) => [
              ...current,
              { title: item.title, outcome },
            ]);
          }
        } catch (cause) {
          if (signal.aborted) break;
          failed = true;
          setResults((current) => [
            ...current,
            {
              title: item.title,
              outcome: "Failed",
              error: errorMessage(cause),
            },
          ]);
        }
        if (signal.aborted) break;
        await reload(signal);
        if (failed) {
          const connection = await api.notionConnection(signal);
          if (signal.aborted) break;
          onConnectionChange(connection);
          if (connection.kind !== "connected") break;
        }
      }
    });
  }

  return {
    sources,
    loading,
    busy,
    error,
    progress,
    results,
    detail,
    clearDetail: () => setDetail(null),
    reload: () => run(reload),
    importPages: (pages: { id: string; title: string }[]) =>
      batch(
        pages.map((page) => ({
          title: page.title,
          action: (signal) => api.importNotionSource(page.id, signal),
        })),
        "Imported",
      ),
    refresh: (pages: ExperienceSource[]) =>
      batch(
        pages.map((page) => ({
          title: page.title,
          action: (signal) => api.refreshNotionSource(page.id, signal),
        })),
        "Refreshed",
      ),
    inspect: (id: string) =>
      run(async (signal) => {
        const result = await api.notionSourceDetail(id, signal);
        if (!signal.aborted) setDetail(result);
      }),
    remove: (id: string) =>
      run(async (signal) => {
        await api.removeNotionSource(id, signal);
        if (signal.aborted) return;
        onSourcesChanged();
        setDetail(null);
        setResults([]);
        await reload(signal);
      }),
  };
}
