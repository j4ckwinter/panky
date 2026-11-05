import type { PickFixture, PicksAvailability } from "@panky/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Api, errorMessage } from "../../api/chat";

export function usePicks(api: Api) {
  const [catalogue, setCatalogue] = useState<{
    fixtures: PickFixture[];
    availability: PicksAvailability | null;
  }>({ fixtures: [], availability: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const load = useCallback(
    async (refresh = false) => {
      if (refresh && active.current) return;
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const result = await (refresh
          ? api.refreshPicks(controller.signal)
          : api.picks(controller.signal));
        if (!controller.signal.aborted) setCatalogue(result);
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
          active.current = null;
        }
      }
    },
    [api],
  );
  useEffect(() => {
    void load();
    return () => active.current?.abort();
  }, [load]);
  return { ...catalogue, loading, refreshing, error, load };
}
