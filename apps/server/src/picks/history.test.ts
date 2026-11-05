import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { picksHistorySchema, type RealPickFixture } from "@panky/shared";
import { PredictionsStore } from "./predictions-store.js";
import { picksHistory } from "./history.js";
import type { FootballSnapshot } from "./data.js";

function prediction(id: string, modelVersion = "test-v1"): RealPickFixture {
  return {
    id,
    sample: false,
    matchDate: "2026-11-08",
    competition: "Premier League",
    homeTeam: "Home",
    awayTeam: "Away",
    probabilities: { home: 0.6, draw: 0.3, away: 0.1 },
    evidence: [],
    caveats: [],
    prediction: {
      modelVersion,
      recordedAt: "2026-11-05T12:00:00Z",
      sourceRetrievedAt: "2026-11-05T11:00:00Z",
      sourceRevision: "a".repeat(40),
      trainingThrough: "2026-11-04",
      trainingMatches: 100,
      homeMatches: 10,
      awayMatches: 10,
      expectedGoals: { home: 2, away: 1 },
    },
  };
}
function source(
  date = "2026-11-09",
  score: [number, number] | null = [2, 1],
  matchDate = "2026-11-08",
): FootballSnapshot {
  return {
    source: {
      name: "OpenFootball",
      license: "CC0-1.0",
      revision: "b".repeat(40),
      retrievedAt: `${date}T10:00:00Z`,
      asOf: date,
    },
    matches: [
      {
        id: "a".repeat(64),
        competition: "en.1",
        season: "2026-27",
        homeTeam: "Home",
        awayTeam: "Away",
        matchDate,
        homeGoals: score?.[0] ?? null,
        awayGoals: score?.[1] ?? null,
      },
    ],
    coverage: [],
  };
}
const now = new Date("2026-11-15T12:00:00Z");
test("result revisions persist without changing forecasts; replay, missing scores and older observations cannot roll back", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "picks-results-"));
  const path = join(directory, "test.sqlite");
  let store = new PredictionsStore(path);
  t.after(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const original = prediction("first");
  store.reconcile(source(), now);
  store.save("a".repeat(64), original);
  assert.equal(store.results(original.id).length, 0);
  store.reconcile(source(), now);
  store.reconcile(source(), now);
  store.reconcile(source("2026-11-10", null), now);
  assert.equal(store.results(original.id).length, 1);
  store.reconcile(source("2026-11-11"), now);
  store.reconcile(source("2026-11-10", [0, 2]), now);
  assert.equal(store.results(original.id).length, 1);
  store.reconcile(source("2026-11-12", [0, 2]), now);
  store.reconcile(source("2026-11-13", [0, 2], "2026-11-07"), now);
  store.reconcile(source("2026-11-16", [4, 0]), now);
  const futureAsOf = source("2026-11-14", [4, 0]);
  futureAsOf.source.asOf = "2026-11-16";
  store.reconcile(futureAsOf, now);
  assert.equal(store.results(original.id).length, 3);
  assert.deepEqual(store.all(), [original]);
  const before = picksHistory(store, now);
  assert.equal(before.history[0]?.result?.awayGoals, 2);
  store.close();
  store = new PredictionsStore(path);
  assert.deepEqual(picksHistory(store, now), before);
});
test("prospective summaries include all forecasts and exclude early reschedules and already known results", (t) => {
  const store = new PredictionsStore(":memory:");
  t.after(() => store.close());
  store.save("a".repeat(64), prediction("correct"));
  const wrong = prediction("wrong");
  store.save("b".repeat(64), wrong);
  store.save("c".repeat(64), prediction("pending"));
  store.save("d".repeat(64), prediction("excluded"));
  store.save("e".repeat(64), prediction("known"));
  store.save("f".repeat(64), prediction("other", "other-model"));
  const snapshot = source();
  const match = snapshot.matches[0];
  assert(match);
  snapshot.matches.push(
    { ...match, id: "b".repeat(64), homeGoals: 0, awayGoals: 1 },
    { ...match, id: "d".repeat(64), matchDate: "2026-11-06" },
  );
  store.reconcile(snapshot, now);
  const known = source("2026-11-05");
  const first = known.matches[0];
  assert(first);
  first.id = "e".repeat(64);
  store.reconcile(known, now);
  const history = picksHistorySchema.parse(picksHistory(store, now));
  const metrics = history.performance.find(
    (row) => row.modelVersion === "test-v1",
  );
  assert(metrics);
  assert.equal(metrics.recorded, 5);
  assert.equal(metrics.scored, 2);
  assert.equal(metrics.excluded, 2);
  assert.equal(metrics.pending, 1);
  assert.equal(metrics.correct, 1);
  assert.equal(metrics.accuracy, 0.5);
  assert(Math.abs((metrics.brier ?? 0) - 0.76) < 1e-10);
  assert(
    Math.abs((metrics.logLoss ?? 0) - (-Math.log(0.6) - Math.log(0.1)) / 2) <
      1e-10,
  );
  assert.equal(
    history.performance.find((row) => row.modelVersion === "other-model")
      ?.brier,
    null,
  );
  assert.equal(
    picksHistory(store, new Date("2026-11-06")).history.find(
      (row) => row.fixture.id === "pending",
    )?.status,
    "upcoming",
  );
});
