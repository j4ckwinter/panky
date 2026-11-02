import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ImportedPage } from "./imported-page.js";
import { ExperienceStore } from "./store.js";

function page(title: string, ...text: string[]): ImportedPage {
  return {
    pageId: randomUUID(),
    title,
    warnings: [],
    passages: text.map((text) => ({ blockId: randomUUID(), text })),
  };
}

test("experience search ranks relevant passages, expands wording, and returns no unsupported matches", () => {
  const store = new ExperienceStore(":memory:");
  try {
    const rollout = store.replace(
      "owner",
      page(
        "Reporting rollout",
        "I resolved a disagreement by proposing a staged deployment and rollback rehearsal.",
      ),
    );
    const performance = store.replace(
      "owner",
      page(
        "Search performance",
        "I measured latency and profiled the database query before adding an index.",
      ),
    );
    const coaching = store.replace(
      "owner",
      page(
        "Coaching",
        "I coached a colleague through their first production release.",
      ),
    );
    for (const [question, expected] of [
      ["Tell me about resolving conflict during deployment", rollout.id],
      ["How did you improve query speed?", performance.id],
      ["Give an example of mentorship", coaching.id],
      ["What did you learn from a rollback rehearsal?", rollout.id],
    ] as const)
      assert.equal(
        store.search("owner", question)[0]?.sourceId,
        expected,
        question,
      );
    for (const question of [
      "How much revenue did you generate?",
      "Tell me about your experience",
      '" OR * )',
      "🦄",
      "quantum cryptography",
    ]) {
      assert.deepEqual(store.search("owner", question), [], question);
    }
    const result = store.search("owner", "disagreement")[0];
    assert(result);
    assert.match(
      result.url,
      /^https:\/\/www\.notion\.so\/[a-f0-9]{32}#[a-f0-9]{32}$/,
    );
    assert.equal(
      result.excerpt,
      store.detail("owner", rollout.id)?.passages[0]?.excerpt,
    );
  } finally {
    store.close();
  }
});

test("experience operations isolate owners even when the same Notion page is imported twice", () => {
  const store = new ExperienceStore(":memory:");
  try {
    const input = page(
      "Private migration",
      "Owner-only migration decision and confidential rollout notes.",
    );
    const owner = store.replace("owner", input);
    const other = store.replace("other-user", {
      ...input,
      title: "Member testing",
      passages: [
        { blockId: randomUUID(), text: "Member-only testing example." },
      ],
    });
    assert.notEqual(owner.id, other.id);
    assert.equal(store.findByPage("owner", input.pageId)?.id, owner.id);
    assert.equal(store.findByPage("other-user", input.pageId)?.id, other.id);
    assert.equal(store.detail("other-user", owner.id), undefined);
    assert.deepEqual(store.search("other-user", "confidential migration"), []);
    assert.deepEqual(store.search("owner", "testing"), []);
    assert.equal(store.remove("other-user", owner.id), false);
    store.fail("other-user", owner.id, "Not permitted");
    assert.equal(store.detail("owner", owner.id)?.source.error, null);
    assert.deepEqual(
      store.list("owner").map((source) => source.id),
      [owner.id],
    );
    assert.deepEqual(
      store.list("other-user").map((source) => source.id),
      [other.id],
    );
  } finally {
    store.close();
  }
});

test("refresh replaces passages and index atomically, preserves identity, and removal clears retrieval", () => {
  const store = new ExperienceStore(":memory:");
  try {
    const input = page(
      "Initial project",
      "The obsolete deployment used a canary rollout.",
    );
    const first = store.replace("owner", input);
    const second = store.replace("owner", input);
    assert.equal(first.id, second.id);
    assert.equal(store.list("owner").length, 1);
    assert.equal(store.detail("owner", first.id)?.passages.length, 1);
    store.replace("owner", {
      ...input,
      title: "New project",
      passages: [
        { blockId: randomUUID(), text: "Replacement mentoring evidence." },
      ],
    });
    assert.deepEqual(store.search("owner", "obsolete canary"), []);
    assert.equal(store.search("owner", "mentorship")[0]?.sourceId, first.id);
    assert.throws(
      () =>
        store.replace("owner", {
          ...input,
          passages: [{ blockId: randomUUID(), text: "x".repeat(1201) }],
        }),
      /content limits/,
    );
    assert.equal(store.search("owner", "mentorship")[0]?.sourceId, first.id);
    assert.equal(store.remove("owner", first.id), true);
    assert.equal(store.detail("owner", first.id), undefined);
    assert.deepEqual(store.search("owner", "mentorship"), []);
    assert.equal(store.remove("owner", first.id), false);
  } finally {
    store.close();
  }
});

test("failed refresh preserves inspectable old material and import time but excludes it from answers", () => {
  const store = new ExperienceStore(":memory:");
  try {
    const input = page(
      "Migration",
      "A migration supported by a phased rollout.",
    );
    input.warnings = ["An image block was skipped."];
    const initial = store.replace("owner", input);
    store.fail("owner", initial.id, "Notion could not refresh this page.");
    const old = store.detail("owner", initial.id);
    assert(old);
    assert.equal(old.source.importedAt, initial.importedAt);
    assert(old.source.lastAttemptAt >= initial.lastAttemptAt);
    assert.equal(old.passages[0]?.excerpt, input.passages[0]?.text);
    assert.deepEqual(old.source.warnings, input.warnings);
    assert.match(old.source.error ?? "", /could not refresh/);
    assert.deepEqual(store.search("owner", "migration"), []);
    store.replace("owner", input);
    assert.equal(store.search("owner", "migration").length, 1);
    assert.equal(store.detail("owner", initial.id)?.source.error, null);
  } finally {
    store.close();
  }
});

test("source and retrieval bounds apply per owner and allow refresh at capacity", () => {
  const store = new ExperienceStore(":memory:");
  try {
    const initial = page(
      "Migration",
      ...Array.from(
        { length: 4 },
        (_, i) => `Migration passage ${i} with supported evidence.`,
      ),
    );
    store.replace("owner", initial);
    assert.equal(store.search("owner", "migration").length, 3);
    for (let i = 1; i < 50; i++)
      store.replace("owner", page(`Source ${i}`, "Other content."));
    assert.throws(
      () => store.replace("owner", page("Overflow", "A passage.")),
      /50 experience sources/,
    );
    assert.doesNotThrow(() => store.replace("owner", initial));
    assert.doesNotThrow(() =>
      store.replace("other", page("Other owner", "An independent quota.")),
    );
    assert.throws(
      () =>
        store.replace(
          "other",
          page("Too many passages", ...Array(101).fill("Passage")),
        ),
      /content limits/,
    );
    assert.throws(
      () =>
        store.replace(
          "other",
          page("Too much text", ...Array(60).fill("x".repeat(1200))),
        ),
      /content limits/,
    );
    assert.equal(store.list("owner").length, 50);
    assert.equal(store.list("other").length, 1);
  } finally {
    store.close();
  }
});

test("experience sources and search index survive restart in isolated storage", () => {
  const directory = mkdtempSync(join(tmpdir(), "panky-experience-"));
  const path = join(directory, "test.sqlite");
  let store = new ExperienceStore(path);
  try {
    const saved = store.replace(
      "owner",
      page(
        "Incident review",
        "We investigated an outage and recorded the recovery steps.",
      ),
    );
    const before = store.detail("owner", saved.id);
    store.close();
    store = new ExperienceStore(path);
    assert.deepEqual(store.detail("owner", saved.id), before);
    assert.equal(store.search("owner", "downtime")[0]?.sourceId, saved.id);
    store.remove("owner", saved.id);
    store.close();
    store = new ExperienceStore(path);
    assert.deepEqual(store.search("owner", "outage"), []);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
