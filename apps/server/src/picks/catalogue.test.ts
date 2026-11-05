import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { PicksCatalogue } from "./catalogue.js";
import { PredictionsStore } from "./predictions-store.js";
import { normalizeFootballFile, type FootballSnapshot } from "./data.js";
import { picksContext } from "./prompt.js";

function snapshot(): FootballSnapshot {
  const matches = [];
  for (let home = 0; home < 20; home++)
    for (let away = 0; away < 20; away++) {
      if (home === away) continue;
      const i: number = matches.length;
      matches.push({
        team1: `Team ${home}`,
        team2: `Team ${away}`,
        date: i < 100 ? "2026-11-04" : i === 100 ? "2026-11-06" : "2026-11-07",
        ...(i < 100 ? { score: { ft: [2, 1] } } : {}),
      });
    }
  const normalized = normalizeFootballFile(
    { name: "English Premier League 2026/27", matches },
    { competition: "en.1", season: "2026-27", asOf: "2026-11-05" },
  );
  return {
    source: {
      name: "OpenFootball",
      license: "CC0-1.0",
      revision: "a".repeat(40),
      retrievedAt: "2026-11-05T09:00:00Z",
      asOf: "2026-11-05",
    },
    matches: normalized.matches,
    coverage: [normalized.coverage],
  };
}

test("real catalogue freezes predictions, skips the preceding day, holds stale/errors without sample fallback", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "picks-catalogue-"));
  const path = join(directory, "source.json");
  const store = new PredictionsStore(join(directory, "test.sqlite"));
  t.after(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  let now = new Date("2026-11-05T12:00:00Z");
  const source = snapshot();
  await writeFile(path, JSON.stringify(source));
  const catalogue = new PicksCatalogue(store, path, () => now);
  await assert.rejects(catalogue.refresh(), /already running/);
  await catalogue.ready();
  const first = catalogue.list();
  assert.equal(first.availability.state, "ready");
  assert.equal(first.fixtures.length, 279);
  assert(
    first.fixtures.every((f) => !f.sample && f.matchDate === "2026-11-07"),
  );
  const prediction = first.fixtures[0];
  assert(prediction && !prediction.sample);
  const context = picksContext(prediction, [], "Explain", 16000);
  assert.match(
    context[0]?.content ?? "",
    /Never change numeric probabilities|never change numeric probabilities/,
  );
  assert.match(context[1]?.content ?? "", /saved experimental prediction/);
  source.source.revision = "b".repeat(40);
  await writeFile(path, JSON.stringify(source));
  await catalogue.refresh();
  assert.deepEqual(catalogue.list().fixtures, first.fixtures);
  now = new Date("2026-11-06T12:00:00Z");
  assert.equal(catalogue.list().availability.state, "held");
  await writeFile(path, "bad");
  await catalogue.refresh();
  assert.equal(catalogue.list().availability.state, "error");
  assert.deepEqual(catalogue.list().fixtures, first.fixtures);
  now = new Date("2026-11-07T00:00:00Z");
  assert.deepEqual(catalogue.list().fixtures, []);
  assert.deepEqual(catalogue.find(prediction.id), prediction);
  assert.deepEqual(store.all(), first.fixtures);
});

test("incomplete or missing-result source holds publication and missing file never returns samples", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "picks-held-"));
  const path = join(directory, "source.json");
  const store = new PredictionsStore(":memory:");
  t.after(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const catalogue = new PicksCatalogue(
    store,
    path,
    () => new Date("2026-11-05T12:00:00Z"),
  );
  await catalogue.ready();
  assert.equal(catalogue.list().availability.state, "error");
  assert.equal(catalogue.list().fixtures.length, 0);
  const original = snapshot();
  const missing = original.matches[0];
  assert(missing);
  missing.homeGoals = null;
  missing.awayGoals = null;
  const coverage = original.coverage[0];
  assert(coverage);
  coverage.results--;
  coverage.pastUnscored++;
  await writeFile(path, JSON.stringify(original));
  await catalogue.refresh();
  assert.equal(catalogue.list().availability.state, "held");
  assert.match(catalogue.list().availability.message, /missing results/);
  assert.equal(catalogue.list().fixtures.length, 0);
  original.matches.pop();
  coverage.received--;
  coverage.accepted--;
  coverage.upcoming--;
  await writeFile(path, JSON.stringify(original));
  await catalogue.refresh();
  assert.match(catalogue.list().availability.message, /schedule is incomplete/);
});
