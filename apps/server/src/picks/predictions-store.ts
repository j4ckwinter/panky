import { DatabaseSync } from "node:sqlite";
import {
  realPickFixtureSchema,
  pickResultSchema,
  type PickResult,
  type RealPickFixture,
} from "@panky/shared";
import type { FootballSnapshot } from "./data.js";

export class PredictionsStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS picks_predictions (
        id TEXT PRIMARY KEY, matchId TEXT NOT NULL, modelVersion TEXT NOT NULL,
        snapshot TEXT NOT NULL, UNIQUE(matchId, modelVersion)
      );
      CREATE TABLE IF NOT EXISTS picks_results (
        id INTEGER PRIMARY KEY, matchId TEXT NOT NULL, snapshot TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS picks_results_match ON picks_results(matchId);
      CREATE TABLE IF NOT EXISTS picks_result_observations (
        matchId TEXT PRIMARY KEY, retrievedAt TEXT NOT NULL
      );`);
  }
  all(): RealPickFixture[] {
    return this.db
      .prepare("SELECT snapshot FROM picks_predictions ORDER BY rowid")
      .all()
      .map((row) =>
        realPickFixtureSchema.parse(JSON.parse(String(row.snapshot))),
      );
  }
  save(matchId: string, fixture: RealPickFixture) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO picks_predictions (id,matchId,modelVersion,snapshot) VALUES (?,?,?,?)",
      )
      .run(
        fixture.id,
        matchId,
        fixture.prediction.modelVersion,
        JSON.stringify(fixture),
      );
  }
  results(fixtureId: string): PickResult[] {
    return this.db
      .prepare(`SELECT r.snapshot FROM picks_results r
      JOIN picks_predictions p ON p.matchId = r.matchId WHERE p.id = ? ORDER BY r.id`)
      .all(fixtureId)
      .map((row) => pickResultSchema.parse(JSON.parse(String(row.snapshot))));
  }
  reconcile(snapshot: FootballSnapshot, now: Date) {
    if (
      Date.parse(snapshot.source.retrievedAt) > now.getTime() ||
      snapshot.source.asOf > now.toISOString().slice(0, 10)
    )
      return;
    const recorded = new Set(
      this.db
        .prepare("SELECT DISTINCT matchId FROM picks_predictions")
        .all()
        .map((row) => String(row.matchId)),
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const match of snapshot.matches) {
        if (
          !recorded.has(match.id) ||
          match.homeGoals === null ||
          match.awayGoals === null
        )
          continue;
        const observation = this.db
          .prepare(
            "SELECT retrievedAt FROM picks_result_observations WHERE matchId = ?",
          )
          .get(match.id);
        if (
          observation &&
          Date.parse(String(observation.retrievedAt)) >=
            Date.parse(snapshot.source.retrievedAt)
        )
          continue;
        const previousRow = this.db
          .prepare(
            "SELECT snapshot FROM picks_results WHERE matchId = ? ORDER BY id DESC LIMIT 1",
          )
          .get(match.id);
        const previous = previousRow
          ? pickResultSchema.parse(JSON.parse(String(previousRow.snapshot)))
          : null;
        if (
          !previous ||
          previous.homeGoals !== match.homeGoals ||
          previous.awayGoals !== match.awayGoals ||
          previous.matchDate !== match.matchDate
        ) {
          const result: PickResult = {
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
            outcome:
              match.homeGoals > match.awayGoals
                ? "home"
                : match.homeGoals < match.awayGoals
                  ? "away"
                  : "draw",
            matchDate: match.matchDate,
            recordedAt: now.toISOString(),
            sourceRetrievedAt: snapshot.source.retrievedAt,
            sourceRevision: snapshot.source.revision,
          };
          this.db
            .prepare(
              "INSERT INTO picks_results (matchId,snapshot) VALUES (?,?)",
            )
            .run(match.id, JSON.stringify(result));
        }
        this.db
          .prepare(
            "INSERT INTO picks_result_observations (matchId,retrievedAt) VALUES (?,?) ON CONFLICT(matchId) DO UPDATE SET retrievedAt=excluded.retrievedAt",
          )
          .run(match.id, snapshot.source.retrievedAt);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
