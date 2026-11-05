import { DatabaseSync } from "node:sqlite";
import { realPickFixtureSchema, type RealPickFixture } from "@panky/shared";

export class PredictionsStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS picks_predictions (
        id TEXT PRIMARY KEY, matchId TEXT NOT NULL, modelVersion TEXT NOT NULL,
        snapshot TEXT NOT NULL, UNIQUE(matchId, modelVersion)
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
  close() {
    this.db.close();
  }
}
