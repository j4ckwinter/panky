import {
  type FootballSnapshot,
  seasonSchema,
  competitionSchema,
} from "./data.js";
import {
  MODEL_VERSION,
  type Probabilities,
  predictFootballMatch,
} from "./model.js";

export type Outcome = keyof Probabilities;
const outcomes: Outcome[] = ["home", "draw", "away"];
export type ScoredPrediction = {
  probabilities: Probabilities;
  outcome: Outcome;
};
export function probabilityMetrics(rows: readonly ScoredPrediction[]) {
  if (!rows.length)
    throw new Error("Evaluation requires completed predictions.");
  let brier = 0;
  let logLoss = 0;
  let correct = 0;
  const calibration = outcomes.map((outcome) => ({
    outcome,
    bins: Array.from({ length: 10 }, (_, index) => ({
      lower: index / 10,
      upper: (index + 1) / 10,
      count: 0,
      probabilitySum: 0,
      observed: 0,
    })),
  }));
  for (const row of rows) {
    const values = outcomes.map((outcome) => row.probabilities[outcome]);
    if (
      values.some(
        (value) => !Number.isFinite(value) || value <= 0 || value >= 1,
      ) ||
      Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-9
    )
      throw new Error(
        "Evaluation probabilities must be positive and sum to one.",
      );
    const predicted = outcomes.reduce(
      (best, outcome) =>
        row.probabilities[outcome] > row.probabilities[best] ? outcome : best,
      "home",
    );
    if (predicted === row.outcome) correct++;
    logLoss -= Math.log(row.probabilities[row.outcome]);
    for (const item of calibration) {
      const probability = row.probabilities[item.outcome];
      const observed = Number(item.outcome === row.outcome);
      brier += (probability - observed) ** 2;
      const bin = item.bins[Math.min(9, Math.floor(probability * 10))];
      if (!bin) throw new Error("Invalid calibration bin.");
      bin.count++;
      bin.probabilitySum += probability;
      bin.observed += observed;
    }
  }
  return {
    count: rows.length,
    brier: brier / rows.length,
    logLoss: logLoss / rows.length,
    accuracy: correct / rows.length,
    calibration: calibration.map(({ outcome, bins }) => ({
      outcome,
      bins: bins.map(({ probabilitySum, observed, ...bin }) => ({
        ...bin,
        meanProbability: bin.count ? probabilitySum / bin.count : null,
        observedFrequency: bin.count ? observed / bin.count : null,
      })),
    })),
  };
}

export function evaluateFootballModel(
  snapshot: FootballSnapshot,
  options: {
    competition?: FootballSnapshot["matches"][number]["competition"];
    season?: string;
  } = {},
) {
  const competition = competitionSchema.parse(options.competition ?? "en.1");
  const season = seasonSchema.parse(options.season ?? "2025-26");
  const coverage = snapshot.coverage.find(
    (item) => item.competition === competition && item.season === season,
  );
  if (
    !coverage ||
    coverage.status !== "available" ||
    coverage.accepted !== (competition === "en.1" ? 380 : 552) ||
    coverage.results !== coverage.accepted
  )
    throw new Error(
      "Evaluation requires a complete accepted target season, not a selected subset of results.",
    );
  const targets = snapshot.matches
    .filter(
      (match) => match.competition === competition && match.season === season,
    )
    .sort(
      (a, b) =>
        a.matchDate.localeCompare(b.matchDate) || a.id.localeCompare(b.id),
    );
  const expectedTeams = competition === "en.1" ? 20 : 24;
  const teams = new Set(
    targets.flatMap((match) => [match.homeTeam, match.awayTeam]),
  );
  const pairings = new Set(
    targets.map((match) => JSON.stringify([match.homeTeam, match.awayTeam])),
  );
  if (
    targets.length !== expectedTeams * (expectedTeams - 1) ||
    teams.size !== expectedTeams ||
    pairings.size !== targets.length ||
    targets.some((match) => match.homeTeam === match.awayTeam)
  )
    throw new Error(
      "Evaluation requires every ordered home/away pairing exactly once in a complete regular season.",
    );
  const predictions = targets.map((match) => {
    if (match.homeGoals === null || match.awayGoals === null)
      throw new Error("Target match has no result.");
    const outcome: Outcome =
      match.homeGoals > match.awayGoals
        ? "home"
        : match.homeGoals === match.awayGoals
          ? "draw"
          : "away";
    return {
      matchId: match.id,
      matchDate: match.matchDate,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      outcome,
      ...predictFootballMatch(snapshot.matches, match, match.matchDate),
    };
  });
  return {
    modelVersion: MODEL_VERSION,
    competition,
    season,
    source: snapshot.source,
    method:
      "Chronological whole-day walk-forward; current and previous July–June seasons; no same-day results; fixed parameters, no test-season tuning.",
    limitation:
      "Historical source files were retrieved later; original publication timestamps and later corrections are unknown. These are retrospective predictions, not recorded prematch performance.",
    model: probabilityMetrics(predictions),
    baseline: probabilityMetrics(
      predictions.map((row) => ({
        probabilities: row.baseline,
        outcome: row.outcome,
      })),
    ),
    predictions,
  };
}
