import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  EXPERIENCE_LIMITS,
  type Evidence,
  evidenceSchema,
  type ExperienceSource,
  experienceSourceSchema,
} from "@panky/shared";
import { HttpError } from "../http-utils.js";
import { importedPageSchema, type ImportedPage } from "./imported-page.js";
import { experienceQuery } from "./search.js";

function source(row: Record<string, unknown>): ExperienceSource {
  return experienceSourceSchema.parse({
    ...row,
    warnings: JSON.parse(String(row.warnings)),
  });
}

export class ExperienceStore {
  private readonly db: DatabaseSync;

  constructor(
    path: string,
    private readonly eligibleConnection: (
      ownerId: string,
    ) => string | null = () => null,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS experience_sources (
        id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, pageId TEXT NOT NULL,
        title TEXT NOT NULL, url TEXT NOT NULL, importedAt TEXT NOT NULL,
        lastAttemptAt TEXT NOT NULL, error TEXT, warnings TEXT NOT NULL,
        passageCount INTEGER NOT NULL, UNIQUE(ownerId, pageId)
      );
      CREATE TABLE IF NOT EXISTS experience_passages (
        id INTEGER PRIMARY KEY, sourceId TEXT NOT NULL REFERENCES experience_sources(id),
        blockId TEXT NOT NULL, text TEXT NOT NULL, ordinal INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS experience_passages_source ON experience_passages(sourceId);
      CREATE VIRTUAL TABLE IF NOT EXISTS experience_search USING fts5(title, text, tokenize='porter unicode61');
    `);
    const columns = this.db
      .prepare("PRAGMA table_info(experience_sources)")
      .all();
    if (!columns.some((column) => column.name === "connectionId"))
      this.db.exec(
        "ALTER TABLE experience_sources ADD COLUMN connectionId TEXT",
      );
  }

  close() {
    this.db.close();
  }

  list(ownerId: string): ExperienceSource[] {
    return this.db
      .prepare(
        "SELECT * FROM experience_sources WHERE ownerId = ? ORDER BY importedAt DESC, id",
      )
      .all(ownerId)
      .map(source);
  }

  status(ownerId: string) {
    const connectionId = this.eligibleConnection(ownerId);
    const sources = this.list(ownerId);
    return {
      totalCount: sources.length,
      usableCount: sources.filter(
        (source) =>
          !source.error &&
          source.passageCount > 0 &&
          (!source.connectionId || source.connectionId === connectionId),
      ).length,
    };
  }

  findByPage(ownerId: string, pageId: string): ExperienceSource | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM experience_sources WHERE ownerId = ? AND pageId = ?",
      )
      .get(ownerId, pageId.toLowerCase());
    return row ? source(row) : undefined;
  }

  detail(
    ownerId: string,
    id: string,
  ): { source: ExperienceSource; passages: Evidence[] } | undefined {
    const row = this.db
      .prepare("SELECT * FROM experience_sources WHERE ownerId = ? AND id = ?")
      .get(ownerId, id);
    if (!row) return undefined;
    const saved = source(row);
    const passages = this.db
      .prepare(
        "SELECT * FROM experience_passages WHERE sourceId = ? ORDER BY ordinal",
      )
      .all(id);
    return {
      source: saved,
      passages: passages.map((passage) => this.evidence(saved, passage)),
    };
  }

  replace(
    ownerId: string,
    imported: ImportedPage,
    connectionId: string | null = null,
  ): ExperienceSource {
    const parsed = importedPageSchema.safeParse(imported);
    if (!parsed.success)
      throw new HttpError(
        400,
        "Imported experience exceeds supported content limits.",
      );
    const page = parsed.data;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.findByPage(ownerId, page.pageId);
      const count = Number(
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM experience_sources WHERE ownerId = ?",
          )
          .get(ownerId)?.count ?? 0,
      );
      if (!previous && count >= EXPERIENCE_LIMITS.sources)
        throw new HttpError(
          409,
          `You can import up to ${EXPERIENCE_LIMITS.sources} experience sources. Remove a source before adding another.`,
        );
      const id = previous?.id ?? randomUUID();
      const now = new Date().toISOString();
      const url = `https://www.notion.so/${page.pageId.replaceAll("-", "")}`;
      this.db
        .prepare(`INSERT INTO experience_sources (id,ownerId,pageId,title,url,importedAt,lastAttemptAt,error,warnings,passageCount,connectionId)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(ownerId,pageId) DO UPDATE SET title=excluded.title,url=excluded.url,importedAt=excluded.importedAt,lastAttemptAt=excluded.lastAttemptAt,error=NULL,warnings=excluded.warnings,passageCount=excluded.passageCount,connectionId=excluded.connectionId`)
        .run(
          id,
          ownerId,
          page.pageId,
          page.title,
          url,
          now,
          now,
          JSON.stringify(page.warnings),
          page.passages.length,
          connectionId,
        );
      this.deletePassages(id);
      const insert = this.db.prepare(
        "INSERT INTO experience_passages (sourceId,blockId,text,ordinal) VALUES (?, ?, ?, ?)",
      );
      const index = this.db.prepare(
        "INSERT INTO experience_search (rowid,title,text) VALUES (?, ?, ?)",
      );
      for (const [ordinal, passage] of page.passages.entries()) {
        const { lastInsertRowid } = insert.run(
          id,
          passage.blockId,
          passage.text,
          ordinal,
        );
        index.run(lastInsertRowid, page.title, passage.text);
      }
      const saved = this.findByPage(ownerId, page.pageId);
      if (!saved) throw new Error("Imported source could not be read.");
      this.db.exec("COMMIT");
      return saved;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  fail(ownerId: string, id: string, message: string): void {
    this.db
      .prepare(
        "UPDATE experience_sources SET lastAttemptAt = ?, error = ? WHERE ownerId = ? AND id = ?",
      )
      .run(new Date().toISOString(), message.slice(0, 500), ownerId, id);
  }

  remove(ownerId: string, id: string): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare(
          "SELECT id FROM experience_sources WHERE ownerId = ? AND id = ?",
        )
        .get(ownerId, id);
      if (!existing) {
        this.db.exec("COMMIT");
        return false;
      }
      this.deletePassages(id);
      this.db
        .prepare("DELETE FROM experience_sources WHERE ownerId = ? AND id = ?")
        .run(ownerId, id);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  removeConnection(ownerId: string, connectionId: string) {
    for (const saved of this.list(ownerId))
      if (saved.connectionId === connectionId) this.remove(ownerId, saved.id);
  }

  failConnection(ownerId: string, connectionId: string) {
    this.db
      .prepare(
        "UPDATE experience_sources SET error=?, lastAttemptAt=? WHERE ownerId=? AND connectionId=?",
      )
      .run(
        "Workspace access must be revalidated. Reconnect, then refresh this page.",
        new Date().toISOString(),
        ownerId,
        connectionId,
      );
  }

  search(ownerId: string, question: string): Evidence[] {
    const query = experienceQuery(question);
    if (!query) return [];
    const rows = this.db
      .prepare(`SELECT s.*, p.blockId, p.text FROM experience_search
      JOIN experience_passages p ON p.id = experience_search.rowid
      JOIN experience_sources s ON s.id = p.sourceId
      WHERE experience_search MATCH ? AND s.ownerId = ? AND s.error IS NULL AND (s.connectionId IS NULL OR s.connectionId = ?)
      ORDER BY bm25(experience_search, 2.0, 1.0), s.id, p.ordinal LIMIT 3`)
      .all(query, ownerId, this.eligibleConnection(ownerId));
    return rows.map((row) => this.evidence(source(row), row));
  }

  private evidence(
    saved: ExperienceSource,
    passage: Record<string, unknown>,
  ): Evidence {
    return evidenceSchema.parse({
      sourceId: saved.id,
      pageId: saved.pageId,
      blockId: passage.blockId,
      title: saved.title,
      url: `${saved.url}#${String(passage.blockId).replaceAll("-", "")}`,
      excerpt: passage.text,
      importedAt: saved.importedAt,
    });
  }

  private deletePassages(id: string) {
    this.db
      .prepare(
        "DELETE FROM experience_search WHERE rowid IN (SELECT id FROM experience_passages WHERE sourceId = ?)",
      )
      .run(id);
    this.db
      .prepare("DELETE FROM experience_passages WHERE sourceId = ?")
      .run(id);
  }
}
