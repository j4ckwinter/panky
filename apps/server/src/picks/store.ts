import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  type PickFixture,
  type PickMessage,
  pickMessageSchema,
} from "@panky/shared";

export class PicksStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS picks_messages (
        id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, fixtureId TEXT NOT NULL,
        role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
        createdAt TEXT NOT NULL, snapshot TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS picks_messages_owner_fixture ON picks_messages(ownerId, fixtureId);
      UPDATE picks_messages SET status = 'interrupted' WHERE status = 'running';
    `);
  }
  close() {
    this.db.close();
  }
  messages(ownerId: string, fixtureId: string): PickMessage[] {
    return this.db
      .prepare(
        "SELECT id, role, content, status, createdAt FROM picks_messages WHERE ownerId = ? AND fixtureId = ? ORDER BY rowid",
      )
      .all(ownerId, fixtureId)
      .map((row) => pickMessageSchema.parse(row));
  }
  begin(ownerId: string, fixture: PickFixture, question: string) {
    const now = new Date().toISOString();
    const user: PickMessage = {
      id: randomUUID(),
      role: "user",
      content: question,
      status: "completed",
      createdAt: now,
    };
    const assistant: PickMessage = {
      id: randomUUID(),
      role: "assistant",
      content: "",
      status: "running",
      createdAt: now,
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.db.prepare(
        "INSERT INTO picks_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const message of [user, assistant])
        insert.run(
          message.id,
          ownerId,
          fixture.id,
          message.role,
          message.content,
          message.status,
          now,
          JSON.stringify(fixture),
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return assistant;
  }
  save(message: PickMessage) {
    this.db
      .prepare("UPDATE picks_messages SET content = ?, status = ? WHERE id = ?")
      .run(message.content, message.status, message.id);
  }
}
