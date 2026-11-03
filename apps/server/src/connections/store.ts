import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { NotionConnection } from "@panky/shared";
import { z } from "zod";
import { notionTokensSchema, type NotionTokens } from "./notion.js";

const rowSchema = z.object({
  userId: z.string(),
  revision: z.number().int(),
  workspaceId: z.uuid().nullable(),
  workspaceName: z.string().nullable(),
  connectedAt: z.string().nullable(),
  encryptedTokens: z.string().nullable(),
  reconnect: z.number().int(),
});
export class ConnectionStore {
  private readonly db: DatabaseSync;
  constructor(
    path: string,
    private readonly key: string | undefined,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS notion_connections (
      userId TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
      workspaceId TEXT, workspaceName TEXT, connectedAt TEXT, encryptedTokens TEXT,
      reconnect INTEGER NOT NULL DEFAULT 0
    )`);
  }
  close() {
    this.db.close();
  }
  private row(userId: string) {
    const row = this.db
      .prepare("SELECT * FROM notion_connections WHERE userId=?")
      .get(userId);
    return row ? rowSchema.parse(row) : null;
  }
  revision(userId: string) {
    return this.row(userId)?.revision ?? 0;
  }
  advance(userId: string) {
    this.db
      .prepare(
        "INSERT INTO notion_connections (userId,revision) VALUES (?,1) ON CONFLICT(userId) DO UPDATE SET revision=revision+1",
      )
      .run(userId);
    return this.revision(userId);
  }
  status(userId: string, configured: boolean): NotionConnection {
    const row = this.row(userId);
    if (row?.workspaceId && row.connectedAt)
      return {
        kind: row.reconnect || !configured ? "reconnect_required" : "connected",
        workspace: {
          id: row.workspaceId,
          name: row.workspaceName ?? "Notion workspace",
        },
        connectedAt: row.connectedAt,
      };
    return { kind: configured ? "disconnected" : "unavailable" };
  }
  tokens(userId: string) {
    const row = this.row(userId);
    if (!row?.encryptedTokens || !this.key) return null;
    const bytes = Buffer.from(row.encryptedTokens, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(this.key, "hex"),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return notionTokensSchema.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      ),
    );
  }
  save(userId: string, revision: number, tokens: NotionTokens) {
    if (!this.key || this.revision(userId) !== revision) return false;
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(this.key, "hex"),
      iv,
    );
    cipher.setAAD(Buffer.from(userId));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(tokens)),
      cipher.final(),
    ]);
    const encrypted = Buffer.concat([
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]).toString("base64");
    return (
      this.db
        .prepare(`UPDATE notion_connections SET workspaceId=?, workspaceName=?,
      connectedAt=COALESCE(connectedAt,?), encryptedTokens=?, reconnect=0 WHERE userId=? AND revision=?`)
        .run(
          tokens.workspace_id,
          tokens.workspace_name,
          new Date().toISOString(),
          encrypted,
          userId,
          revision,
        ).changes === 1
    );
  }
  requireReconnect(userId: string, revision: number) {
    this.db
      .prepare(
        "UPDATE notion_connections SET reconnect=1, encryptedTokens=NULL WHERE userId=? AND revision=?",
      )
      .run(userId, revision);
  }
  disconnect(userId: string) {
    this.advance(userId);
    this.db
      .prepare(
        "UPDATE notion_connections SET workspaceId=NULL, workspaceName=NULL, connectedAt=NULL, encryptedTokens=NULL, reconnect=0 WHERE userId=?",
      )
      .run(userId);
  }
}
