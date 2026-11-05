import { randomUUID } from "node:crypto";
import type {
  PickFixture,
  PicksAvailability,
  RealPickFixture,
} from "@panky/shared";
import { HttpError } from "../http-utils.js";
import { readFootballSnapshot } from "./data-read.js";
import type { FootballMatch, FootballSnapshot } from "./data.js";
import { sampleFixtures } from "./fixtures.js";
import { MODEL_VERSION, predictFootballMatch } from "./model.js";
import type { PredictionsStore } from "./predictions-store.js";

const day = 86_400_000;
export class PicksCatalogue {
  private loading = false;
  private snapshot: FootballSnapshot | undefined;
  private failure = false;
  private readonly initial: Promise<void>;
  constructor(
    private readonly store: PredictionsStore,
    private readonly path?: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.initial = this.load();
  }
  async ready() {
    await this.initial;
  }
  async refresh() {
    if (this.loading)
      throw new HttpError(409, "A Picks refresh is already running.");
    await this.load();
    return this.list();
  }
  private availability(): PicksAvailability {
    if (!this.path)
      return {
        mode: "sample",
        state: "sample",
        message: "Fictional sample fixtures.",
        sourceRetrievedAt: null,
        lastResultDate: null,
      };
    const snapshot = this.snapshot;
    const base = {
      mode: "real" as const,
      sourceRetrievedAt: snapshot?.source.retrievedAt ?? null,
      lastResultDate: null as string | null,
    };
    if (this.failure || !snapshot)
      return {
        ...base,
        state: "error",
        message:
          "The configured football data could not be loaded. Saved predictions are unchanged.",
      };
    const now = this.now();
    const today = now.toISOString().slice(0, 10);
    const year = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
    const season = `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
    const coverage = snapshot.coverage.find(
      (row) => row.competition === "en.1" && row.season === season,
    );
    base.lastResultDate = coverage?.latestCompletedDate ?? null;
    let reason: string | undefined;
    const age = now.getTime() - Date.parse(snapshot.source.retrievedAt);
    if (age < 0 || age > 2 * day || snapshot.source.asOf !== today)
      reason =
        "The source must be audited today and retrieved within the last 48 hours.";
    else if (!coverage || coverage.status !== "available")
      reason = "Current Premier League coverage is unavailable.";
    else {
      const matches = snapshot.matches.filter(
        (m) => m.competition === "en.1" && m.season === season,
      );
      const teams = new Set(matches.flatMap((m) => [m.homeTeam, m.awayTeam]));
      const pairs = new Set(
        matches.map((m) => JSON.stringify([m.homeTeam, m.awayTeam])),
      );
      if (teams.size !== 20 || matches.length !== 380 || pairs.size !== 380)
        reason = "The current Premier League schedule is incomplete.";
      else if (coverage.pastUnscored > 0)
        reason =
          "Past fixtures have missing results; postponements cannot be distinguished.";
      else if (
        !coverage.latestCompletedDate ||
        Date.parse(today) - Date.parse(coverage.latestCompletedDate) > 14 * day
      )
        reason =
          "The latest completed Premier League result is more than 14 days old.";
    }
    return {
      ...base,
      state: reason ? "held" : "ready",
      message: reason
        ? `New predictions are held. ${reason} Saved predictions are unchanged.`
        : "Experimental Premier League predictions from audited results. Dates have no confirmed kickoff time.",
    };
  }
  list(): { fixtures: PickFixture[]; availability: PicksAvailability } {
    const today = this.now().toISOString().slice(0, 10);
    return {
      fixtures: this.path
        ? this.store
            .all()
            .filter(
              (fixture) =>
                fixture.matchDate > today &&
                Date.parse(fixture.matchDate) <= Date.parse(today) + 14 * day,
            )
        : sampleFixtures,
      availability: this.availability(),
    };
  }
  find(id: string): PickFixture | undefined {
    return (this.path ? this.store.all() : sampleFixtures).find(
      (fixture) => fixture.id === id,
    );
  }
  private async load() {
    if (!this.path) return;
    this.loading = true;
    try {
      const snapshot = await readFootballSnapshot(this.path);
      this.snapshot = snapshot;
      this.failure = false;
      if (this.availability().state !== "ready") return;
      const now = this.now();
      const today = now.toISOString().slice(0, 10);
      const candidates = snapshot.matches.filter(
        (match) =>
          match.competition === "en.1" &&
          match.homeGoals === null &&
          now.getTime() < Date.parse(match.matchDate) - day &&
          Date.parse(match.matchDate) <= Date.parse(today) + 14 * day,
      );
      const predictions = candidates.map((match) => ({
        match,
        fixture: this.predict(snapshot, match, now),
      }));
      for (const { match, fixture } of predictions)
        this.store.save(match.id, fixture);
    } catch {
      this.failure = true;
    } finally {
      this.loading = false;
    }
  }
  private predict(
    snapshot: FootballSnapshot,
    match: FootballMatch,
    now: Date,
  ): RealPickFixture {
    const result = predictFootballMatch(
      snapshot.matches,
      match,
      now.toISOString().slice(0, 10),
    );
    return {
      id: randomUUID(),
      competition: "Premier League",
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sample: false,
      matchDate: match.matchDate,
      probabilities: result.probabilities,
      prediction: {
        modelVersion: MODEL_VERSION,
        recordedAt: now.toISOString(),
        sourceRevision: snapshot.source.revision,
        sourceRetrievedAt: snapshot.source.retrievedAt,
        trainingThrough: result.trainingThrough,
        trainingMatches: result.trainingMatches,
        homeMatches: result.homeMatches,
        awayMatches: result.awayMatches,
        expectedGoals: result.expectedGoals,
      },
      evidence: [
        `Computed from ${result.trainingMatches} completed Premier League matches through ${result.trainingThrough}.`,
        `Home venue sample: ${result.homeMatches}; away venue sample: ${result.awayMatches}.`,
        `Model goal estimates: home ${result.expectedGoals.home.toFixed(2)}, away ${result.expectedGoals.away.toFixed(2)}. These are not shot-based xG.`,
        `OpenFootball CC0 source retrieved ${snapshot.source.retrievedAt}.`,
      ],
      caveats: [
        "Experimental independent Poisson model; probabilities are not guarantees.",
        "No injuries, lineups or team news.",
        "Date only; no confirmed kickoff time. Issued before the start of the preceding UTC day.",
        ...(result.homeMatches === 0 || result.awayMatches === 0
          ? ["A club has no venue history; its estimate uses the league prior."]
          : []),
      ],
    };
  }
}
