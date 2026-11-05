import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFootballAudit } from "./data-output.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { auditFootballData } from "./data-fetch.js";
import { footballSnapshotSchema, normalizeFootballFile } from "./data.js";

const options = {
  competition: "en.1",
  season: "2025-26",
  asOf: "2026-11-05",
} as const;
const match = {
  date: "2025-08-15",
  team1: "Home",
  team2: "Away",
  score: { ft: [2, 0] },
};

test("normalization preserves unknown scores, accepts source score variants and stable reschedules", () => {
  const first = normalizeFootballFile(
    { name: "English Premier League 2025/26", matches: [match] },
    options,
  );
  assert.equal(first.coverage.status, "available");
  assert.equal(first.matches[0]?.homeGoals, 2);
  const rescheduled = normalizeFootballFile(
    {
      name: "English Premier League 2025/26",
      matches: [{ ...match, date: "2025-08-16", score: [2, 0] }],
    },
    options,
  );
  assert.equal(first.matches[0]?.id, rescheduled.matches[0]?.id);
  const unknown = normalizeFootballFile(
    {
      name: "English Premier League 2025/26",
      matches: [{ ...match, score: undefined }],
    },
    options,
  );
  assert.equal(unknown.matches[0]?.homeGoals, null);
  assert.equal(unknown.matches[0]?.awayGoals, null);
  assert.equal(unknown.coverage.results, 0);
  assert.equal(unknown.coverage.pastUnscored, 1);
});

test("a malformed row rejects its entire file rather than leaking a partial dataset", () => {
  for (const invalid of [
    { ...match, date: "2025-02-30" },
    { ...match, date: "2025-02-01" },
    { ...match, score: { ft: [2] } },
    { ...match, score: { ht: [1, 1] } },
    { ...match, score: [-1, 0] },
    { ...match, score: [1.5, 0] },
    { ...match, team2: "Home" },
    { ...match, date: "2026-11-05" },
  ]) {
    const result = normalizeFootballFile(
      {
        name: "English Premier League 2025/26",
        matches: [{ ...match, team2: "Other" }, invalid],
      },
      options,
    );
    assert.equal(result.coverage.status, "rejected");
    assert.equal(result.matches.length, 0);
    assert.equal(result.coverage.accepted, 0);
  }
  const current = normalizeFootballFile(
    {
      name: "English Premier League 2026/27",
      matches: [{ ...match, date: "2026-11-05" }],
    },
    { ...options, season: "2026-27" },
  );
  assert.match(current.coverage.issues[0] ?? "", /on or after/);
});

test("duplicate regular pairings reject the file; explicitly labelled playoffs are excluded", () => {
  const duplicate = normalizeFootballFile(
    {
      name: "English Premier League 2025/26",
      matches: [match, { ...match, date: "2025-08-16" }],
    },
    options,
  );
  assert.equal(duplicate.coverage.status, "rejected");
  assert.equal(duplicate.matches.length, 0);
  const playoff = normalizeFootballFile(
    {
      name: "English Premier League 2025/26",
      matches: [match, { ...match, round: "Finals, Semifinals" }],
    },
    options,
  );
  assert.equal(playoff.matches.length, 1);
  assert.equal(playoff.coverage.excludedPlayoffs, 1);
});

test("coverage separates stale unscored records from future fixtures", () => {
  const result = normalizeFootballFile(
    {
      name: "English Premier League 2026/27",
      matches: [
        { ...match, date: "2026-08-01" },
        { ...match, team1: "Unknown", date: "2026-09-01", score: null },
        { ...match, team1: "Future", date: "2026-11-07", score: null },
      ],
    },
    { ...options, season: "2026-27" },
  );
  assert.equal(result.coverage.results, 1);
  assert.equal(result.coverage.pastUnscored, 1);
  assert.equal(result.coverage.upcoming, 1);
  assert.equal(result.coverage.latestCompletedDate, "2026-08-01");
});

test("audit pins fixed-host requests to one revision and validates saved snapshots", async (context) => {
  const revision = "a".repeat(40);
  const urls: string[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (input: string, init: RequestInit) => {
      urls.push(input);
      assert.equal(init.redirect, "error");
      assert.ok(init.signal);
      if (input.startsWith("https://api.github.com/"))
        return Response.json({ sha: revision });
      assert.ok(
        input.startsWith(
          `https://raw.githubusercontent.com/openfootball/football.json/${revision}/`,
        ),
      );
      if (input.includes("2026-27")) return new Response(null, { status: 404 });
      const year = input.includes("2024-25") ? "2024" : "2025";
      const league = input.includes("en.1")
        ? "Premier League"
        : input.includes("en.2")
          ? "Championship"
          : input.includes("en.3")
            ? "League One"
            : "League Two";
      return Response.json({
        name: `English ${league} ${year}/${Number(year.slice(2)) + 1}`,
        matches: [{ ...match, date: `${year}-08-15` }],
      });
    },
  );
  const snapshot = await auditFootballData({ asOf: options.asOf });
  assert.equal(urls.length, 13);
  assert.equal(snapshot.matches.length, 8);
  assert.equal(
    snapshot.coverage.filter((item) => item.status === "missing").length,
    4,
  );
  assert.equal(snapshot.source.revision, revision);
  assert.equal(footballSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(
    footballSnapshotSchema.safeParse({
      ...snapshot,
      matches: [...snapshot.matches, snapshot.matches[0]],
    }).success,
    false,
  );
  assert.equal(
    footballSnapshotSchema.safeParse({
      ...snapshot,
      coverage: snapshot.coverage.map((item, index) =>
        index === 0 ? { ...item, status: "rejected" } : item,
      ),
    }).success,
    false,
  );
  assert.equal(
    footballSnapshotSchema.safeParse({
      ...snapshot,
      coverage: snapshot.coverage.map((item, index) =>
        index === 0 ? { ...item, results: 100 } : item,
      ),
    }).success,
    false,
  );
  const directory = await mkdtemp(join(tmpdir(), "panky-data-audit-"));
  try {
    assert.equal((await writeFootballAudit(snapshot, directory)).usable, true);
    const stored = await readFile(join(directory, "source.json"), "utf8");
    const failed = {
      ...snapshot,
      matches: [],
      coverage: snapshot.coverage.map((item) => ({
        ...item,
        status: "error" as const,
        accepted: 0,
        results: 0,
        upcoming: 0,
        pastUnscored: 0,
        latestCompletedDate: null,
      })),
    };
    assert.equal((await writeFootballAudit(failed, directory)).usable, false);
    assert.equal(
      await readFile(join(directory, "source.json"), "utf8"),
      stored,
    );
    assert.equal(
      JSON.parse(await readFile(join(directory, "report.json"), "utf8"))
        .coverage[0].status,
      "error",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const before = urls.length;
  await assert.rejects(
    auditFootballData({ revision: "../../other", asOf: options.asOf }),
  );
  assert.equal(urls.length, before);
});

test("source failures are reported without retries or usable matches", async (context) => {
  let requests = 0;
  context.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response("x".repeat(2 * 1024 * 1024 + 1), { status: 200 });
  });
  const snapshot = await auditFootballData({
    revision: "b".repeat(40),
    asOf: options.asOf,
  });
  assert.equal(requests, 12);
  assert.equal(snapshot.matches.length, 0);
  assert.ok(snapshot.coverage.every((item) => item.status === "error"));
});

test("a wrong competition or season label rejects otherwise plausible rows", () => {
  for (const name of [
    "English Championship 2025/26",
    "English Premier League 2024/25",
  ]) {
    const result = normalizeFootballFile({ name, matches: [match] }, options);
    assert.equal(result.coverage.status, "rejected");
    assert.equal(result.matches.length, 0);
    assert.match(result.coverage.issues[0] ?? "", /Expected source name/);
  }
});
