import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ExperienceStore } from "../experience/store.js";
import { ConnectionStore } from "./store.js";
import { tokens } from "./test-support.js";

test("pre-C2 migration preserves legacy sources and assigns existing C1 connections a stable independent identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "panky-c2-migration-"));
  const path = join(directory, "old.sqlite");
  const key = "ab".repeat(32);
  const sourceId = "11111111-1111-4111-8111-111111111111";
  const pageId = "22222222-2222-4222-8222-222222222222";
  const blockId = "33333333-3333-4333-8333-333333333333";
  const timestamp = "2026-11-01T12:00:00.000Z";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from("owner"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens)),
    cipher.final(),
  ]);
  const encrypted = Buffer.concat([
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]).toString("base64");
  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE notion_connections (
      userId TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
      workspaceId TEXT, workspaceName TEXT, connectedAt TEXT, encryptedTokens TEXT,
      reconnect INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE experience_sources (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, pageId TEXT NOT NULL,
      title TEXT NOT NULL, url TEXT NOT NULL, importedAt TEXT NOT NULL,
      lastAttemptAt TEXT NOT NULL, error TEXT, warnings TEXT NOT NULL,
      passageCount INTEGER NOT NULL, UNIQUE(ownerId, pageId)
    );
    CREATE TABLE experience_passages (
      id INTEGER PRIMARY KEY, sourceId TEXT NOT NULL REFERENCES experience_sources(id),
      blockId TEXT NOT NULL, text TEXT NOT NULL, ordinal INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE experience_search USING fts5(title, text, tokenize='porter unicode61');
  `);
  old
    .prepare("INSERT INTO notion_connections VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(
      "owner",
      7,
      tokens.workspace_id,
      tokens.workspace_name,
      timestamp,
      encrypted,
      0,
    );
  old
    .prepare(
      "INSERT INTO experience_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      sourceId,
      "owner",
      pageId,
      "Legacy migration",
      `https://www.notion.so/${pageId.replaceAll("-", "")}`,
      timestamp,
      timestamp,
      null,
      '["Images skipped."]',
      1,
    );
  old
    .prepare("INSERT INTO experience_passages VALUES (?, ?, ?, ?, ?)")
    .run(1, sourceId, blockId, "I led a database migration.", 0);
  old
    .prepare(
      "INSERT INTO experience_search (rowid,title,text) VALUES (?, ?, ?)",
    )
    .run(1, "Legacy migration", "I led a database migration.");
  old.close();
  let connections: ConnectionStore | undefined;
  let sources: ExperienceStore | undefined;
  try {
    connections = new ConnectionStore(path, key);
    sources = new ExperienceStore(path);
    const connectionId = connections.connectionId("owner");
    assert(connectionId);
    assert.equal(connections.revision("owner"), 7);
    assert.equal(connections.status("owner", true).kind, "connected");
    assert.deepEqual(connections.tokens("owner"), tokens);
    const before = sources.detail("owner", sourceId);
    assert.equal(before?.source.connectionId, null);
    assert.equal(before?.source.importedAt, timestamp);
    assert.deepEqual(before?.source.warnings, ["Images skipped."]);
    assert.equal(before?.passages[0]?.excerpt, "I led a database migration.");
    assert.equal(
      sources.search("owner", "database migration")[0]?.sourceId,
      sourceId,
    );
    connections.close();
    sources.close();
    connections = new ConnectionStore(path, key);
    sources = new ExperienceStore(path);
    assert.equal(connections.connectionId("owner"), connectionId);
    assert.deepEqual(connections.tokens("owner"), tokens);
    assert.deepEqual(sources.detail("owner", sourceId), before);
    sources.removeConnection("owner", connectionId);
    assert.deepEqual(sources.detail("owner", sourceId), before);
    assert.equal(
      sources.search("owner", "database migration")[0]?.sourceId,
      sourceId,
    );
  } finally {
    connections?.close();
    sources?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
