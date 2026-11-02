import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Store } from "./store.js";

test("additive migration preserves Milestone 1 conversations and recovers old partial messages", () => {
  const directory = mkdtempSync(join(tmpdir(), "panky-migration-"));
  const path = join(directory, "old.sqlite");
  const conversationId = randomUUID();
  const userId = randomUUID();
  const assistantId = randomUUID();
  const now = new Date().toISOString();
  try {
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE messages (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), role TEXT NOT NULL CHECK(role IN ('user', 'assistant')), content TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('streaming', 'completed', 'interrupted')), createdAt TEXT NOT NULL);`);
    old
      .prepare("INSERT INTO conversations VALUES (?, ?, ?, ?)")
      .run(conversationId, "Original title", now, now);
    const insert = old.prepare(
      "INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?)",
    );
    insert.run(
      userId,
      conversationId,
      "user",
      "Saved user message",
      "completed",
      now,
    );
    insert.run(
      assistantId,
      conversationId,
      "assistant",
      "Saved partial reply",
      "streaming",
      now,
    );
    old.close();
    const migrated = new Store(path);
    assert.equal(
      migrated.conversation(conversationId)?.title,
      "Original title",
    );
    assert.deepEqual(
      migrated
        .messages(conversationId)
        .map((message) => [message.id, message.content, message.status]),
      [
        [userId, "Saved user message", "completed"],
        [assistantId, "Saved partial reply", "interrupted"],
      ],
    );
    assert.deepEqual(migrated.runs(conversationId), []);
    assert.deepEqual(
      migrated.messages(conversationId).map((message) => message.sources),
      [[], []],
    );
    const sources = [
      {
        sourceId: randomUUID(),
        pageId: randomUUID(),
        blockId: randomUUID(),
        title: "Saved source",
        url: "https://www.notion.so/11111111111141118111111111111111",
        excerpt: "My contribution was the rollback plan.",
        importedAt: now,
      },
    ];
    const { run, assistant } = migrated.beginResponse(
      conversationId,
      "New task",
      sources,
    );
    migrated.addActivity(run.id, {
      kind: "run_started",
      historyChars: 8,
      omittedMessages: 0,
    });
    migrated.finishRun(run, assistant, "completed", null);
    migrated.close();
    const reopened = new Store(path);
    assert.equal(reopened.messages(conversationId).length, 4);
    assert.deepEqual(reopened.messages(conversationId)[3]?.sources, sources);
    assert.equal(reopened.runs(conversationId)[0]?.status, "completed");
    assert.equal(reopened.activities(conversationId).length, 2);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
