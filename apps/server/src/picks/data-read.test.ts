import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readFootballSnapshot } from "./data-read.js";

test("snapshot reader validates JSON and caps bytes before parsing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "panky-picks-read-"));
  const path = join(directory, "source.json");
  try {
    await writeFile(path, "{invalid JSON");
    await assert.rejects(readFootballSnapshot(path));
    await writeFile(path, JSON.stringify({ matches: [] }));
    await assert.rejects(readFootballSnapshot(path));
    await writeFile(path, " ".repeat(8 * 1024 * 1024 + 1));
    await assert.rejects(readFootballSnapshot(path), /exceeds 8 MiB/);
    const snapshot = {
      source: {
        name: "OpenFootball",
        revision: "a".repeat(40),
        retrievedAt: "2026-11-05T12:00:00Z",
        asOf: "2026-11-05",
        license: "CC0-1.0",
      },
      matches: [],
      coverage: [],
    };
    await writeFile(path, JSON.stringify(snapshot));
    assert.deepEqual(await readFootballSnapshot(path), snapshot);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
