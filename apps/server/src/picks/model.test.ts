import assert from "node:assert/strict";
import test from "node:test";
import {
  type FootballMatch,
  type FootballSnapshot,
  footballMatchId,
} from "./data.js";
import { predictFootballMatch } from "./model.js";
import { evaluateFootballModel, probabilityMetrics } from "./evaluation.js";

function match(
  index: number,
  overrides: Partial<FootballMatch> = {},
): FootballMatch {
  const value = {
    competition: "en.1" as const,
    season: "2024-25",
    matchDate: `2025-${String(1 + Math.floor(index / 28)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`,
    homeTeam: index % 2 ? `Opponent ${index}` : "Home",
    awayTeam: index % 2 ? "Away" : `Opponent ${index}`,
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
  return { ...value, id: footballMatchId(value) };
}
const history = Array.from({ length: 120 }, (_, i) => match(i));
const fixture = match(121, {
  season: "2025-26",
  matchDate: "2025-08-15",
  homeTeam: "Home",
  awayTeam: "Away",
  homeGoals: null,
  awayGoals: null,
});

test("goals model returns normalized finite probabilities and shrinks unseen clubs to league rates", () => {
  const prediction = predictFootballMatch(history, fixture, fixture.matchDate);
  assert.equal(prediction.trainingMatches, 120);
  assert.equal(prediction.homeMatches, 60);
  assert.equal(prediction.awayMatches, 60);
  assert.equal(prediction.trainingThrough, "2025-05-08");
  assert.ok(prediction.probabilities.home > prediction.probabilities.away);
  assert.ok(
    Math.abs(
      Object.values(prediction.probabilities).reduce(
        (sum, value) => sum + value,
        0,
      ) - 1,
    ) < 1e-12,
  );
  for (const value of Object.values(prediction.probabilities))
    assert.ok(Number.isFinite(value) && value > 0 && value < 1);
  const unknown = predictFootballMatch(
    history,
    { ...fixture, homeTeam: "Promoted", awayTeam: "New club" },
    fixture.matchDate,
  );
  assert.equal(unknown.homeMatches, 0);
  assert.equal(unknown.awayMatches, 0);
  assert.ok(Math.abs(unknown.expectedGoals.home - 241 / 121) < 1e-12);
  assert.equal(unknown.expectedGoals.away, 1);
});

test("future results and same-day results cannot alter an earlier prediction", () => {
  const early = predictFootballMatch(history, fixture, fixture.matchDate);
  const future = [
    match(122, {
      season: "2025-26",
      matchDate: fixture.matchDate,
      homeTeam: "Home",
      homeGoals: 30,
    }),
    match(123, {
      season: "2025-26",
      matchDate: "2025-08-16",
      awayTeam: "Away",
      awayGoals: 30,
    }),
  ];
  assert.deepEqual(
    predictFootballMatch([...history, ...future], fixture, "2025-12-31"),
    early,
  );
  assert.deepEqual(
    predictFootballMatch([...history].reverse(), fixture, fixture.matchDate),
    early,
  );
  const knownEarlier = match(124, {
    season: "2025-26",
    matchDate: "2025-08-14",
    homeTeam: "Home",
    homeGoals: 8,
  });
  const after = predictFootballMatch(
    [...history, knownEarlier],
    fixture,
    fixture.matchDate,
  );
  assert.equal(after.trainingMatches, 121);
  assert.ok(after.expectedGoals.home > early.expectedGoals.home);
  assert.deepEqual(
    predictFootballMatch([...history, knownEarlier], fixture, "2025-08-14"),
    early,
  );
});

test("training excludes other competitions, unknown results and old seasons, and requires enough history", () => {
  const irrelevant = [
    match(122, { competition: "en.2", homeGoals: 30 }),
    match(123, { homeGoals: null, awayGoals: null }),
    match(124, { season: "2023-24", matchDate: "2024-05-01", homeGoals: 30 }),
  ];
  assert.deepEqual(
    predictFootballMatch(
      [...history, ...irrelevant],
      fixture,
      fixture.matchDate,
    ),
    predictFootballMatch(history, fixture, fixture.matchDate),
  );
  assert.throws(
    () =>
      predictFootballMatch(history.slice(0, 99), fixture, fixture.matchDate),
    /At least 100/,
  );
  assert.throws(() => predictFootballMatch(history, fixture, "2025-02-30"));
});

test("probability metrics use multiclass Brier sum, natural-log loss and reliability counts", () => {
  const rows = (["home", "draw", "away"] as const).map((outcome) => ({
    outcome,
    probabilities: { home: 1 / 3, draw: 1 / 3, away: 1 / 3 },
  }));
  const result = probabilityMetrics(rows);
  assert.equal(result.count, 3);
  assert.ok(Math.abs(result.brier - 2 / 3) < 1e-12);
  assert.ok(Math.abs(result.logLoss - Math.log(3)) < 1e-12);
  assert.equal(result.accuracy, 1 / 3);
  for (const { bins } of result.calibration) {
    assert.equal(bins[3]?.count, 3);
    assert.equal(bins[3]?.meanProbability, 1 / 3);
    assert.equal(bins[3]?.observedFrequency, 1 / 3);
    assert.equal(bins[0]?.observedFrequency, null);
  }
  assert.throws(() => probabilityMetrics([]), /requires completed/);
  assert.throws(
    () =>
      probabilityMetrics([
        { outcome: "home", probabilities: { home: 0.9, draw: 0.9, away: 0.9 } },
      ]),
    /sum to one/,
  );
});

test("walk-forward evaluation scores every target and future outcomes never enter earlier inputs", () => {
  const teams = [
    "Home",
    "Away",
    ...Array.from({ length: 18 }, (_, i) => `Club ${i}`),
  ];
  const targets = teams
    .flatMap((homeTeam) =>
      teams
        .filter((awayTeam) => awayTeam !== homeTeam)
        .map((awayTeam) => ({ homeTeam, awayTeam })),
    )
    .map((pair, i) =>
      match(200 + i, {
        ...pair,
        season: "2025-26",
        matchDate:
          i === 0 ? "2025-08-15" : i === 1 ? "2025-08-16" : "2025-08-17",
        homeGoals: 1,
        awayGoals: 1,
      }),
    );
  const snapshot: FootballSnapshot = {
    source: {
      name: "OpenFootball",
      revision: "a".repeat(40),
      retrievedAt: "2026-11-05T12:00:00Z",
      asOf: "2026-11-05",
      license: "CC0-1.0",
    },
    matches: [...history, ...targets],
    coverage: [
      {
        competition: "en.1",
        season: "2025-26",
        status: "available",
        received: 380,
        accepted: 380,
        results: 380,
        upcoming: 0,
        pastUnscored: 0,
        excludedPlayoffs: 0,
        latestCompletedDate: "2025-08-17",
        issues: [],
      },
    ],
  };
  const report = evaluateFootballModel(snapshot);
  assert.equal(report.model.count, 380);
  assert.equal(report.baseline.count, 380);
  assert.equal(report.predictions[0]?.trainingMatches, 120);
  assert.equal(report.predictions[1]?.trainingMatches, 121);
  const changed = evaluateFootballModel({
    ...snapshot,
    matches: [
      ...history,
      ...targets.map((item, i) =>
        i === 1 ? { ...item, homeGoals: 30, awayGoals: 0 } : item,
      ),
    ],
  });
  assert.deepEqual(changed.predictions[0], report.predictions[0]);
  assert.deepEqual(
    changed.predictions[1]?.probabilities,
    report.predictions[1]?.probabilities,
  );
  assert.notEqual(changed.model.brier, report.model.brier);
  assert.throws(
    () =>
      evaluateFootballModel({
        ...snapshot,
        matches: [...history, ...targets.slice(1)],
      }),
    /every ordered/,
  );
  assert.throws(
    () =>
      evaluateFootballModel({
        ...snapshot,
        coverage: snapshot.coverage.map((item) => ({ ...item, results: 1 })),
      }),
    /complete accepted target season/,
  );
});
