import {
  mostLikelyPickOutcome,
  type PickHistoryEntry,
  type PicksHistory,
} from "@panky/shared";
import { probabilityMetrics } from "./evaluation.js";
import type { PredictionsStore } from "./predictions-store.js";

export function picksHistory(store: PredictionsStore, now: Date): PicksHistory {
  const today = now.toISOString().slice(0, 10);
  const history: PickHistoryEntry[] = store
    .all()
    .map((fixture): PickHistoryEntry => {
      const revisions = store.results(fixture.id);
      const result = revisions.at(-1) ?? null;
      const recordedAt = Date.parse(fixture.prediction.recordedAt);
      const exclusionReason =
        result &&
        (recordedAt >= Date.parse(fixture.matchDate) - 86_400_000 ||
          recordedAt >= Date.parse(result.matchDate) - 86_400_000)
          ? "The prediction was not recorded before the preceding UTC day of the match date."
          : result &&
              revisions.some(
                (revision) =>
                  Date.parse(revision.sourceRetrievedAt) <= recordedAt,
              )
            ? "The source already contained a result when the prediction was recorded."
            : null;
      return {
        fixture,
        result,
        revisions,
        exclusionReason,
        status: exclusionReason
          ? "excluded"
          : result
            ? "scored"
            : fixture.matchDate > today
              ? "upcoming"
              : "awaiting",
      };
    })
    .sort(
      (a, b) =>
        b.fixture.matchDate.localeCompare(a.fixture.matchDate) ||
        a.fixture.id.localeCompare(b.fixture.id),
    );
  const models = [
    ...new Set(history.map((entry) => entry.fixture.prediction.modelVersion)),
  ];
  const performance = models.map((modelVersion) => {
    const entries = history.filter(
      (entry) => entry.fixture.prediction.modelVersion === modelVersion,
    );
    const scored = entries.flatMap((entry) =>
      entry.status === "scored" && entry.result
        ? [
            {
              probabilities: entry.fixture.probabilities,
              outcome: entry.result.outcome,
            },
          ]
        : [],
    );
    const metrics = scored.length ? probabilityMetrics(scored) : null;
    return {
      modelVersion,
      recorded: entries.length,
      scored: scored.length,
      pending: entries.filter(
        (entry) => entry.status === "upcoming" || entry.status === "awaiting",
      ).length,
      excluded: entries.filter((entry) => entry.status === "excluded").length,
      correct: scored.filter(
        (row) => mostLikelyPickOutcome(row.probabilities) === row.outcome,
      ).length,
      accuracy: metrics?.accuracy ?? null,
      brier: metrics?.brier ?? null,
      logLoss: metrics?.logLoss ?? null,
    };
  });
  return { history, performance };
}
