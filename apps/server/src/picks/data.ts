import { createHash } from "node:crypto";
import { z } from "zod";

export const matchDateSchema = z.iso.date();
export const competitionSchema = z.enum(["en.1", "en.2", "en.3", "en.4"]);
export const seasonSchema = z
  .string()
  .regex(/^20\d{2}-\d{2}$/)
  .refine(
    (value) => Number(value.slice(5)) === (Number(value.slice(0, 4)) + 1) % 100,
  );
const goalsSchema = z.number().int().min(0).max(30);
export const footballMatchSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    competition: competitionSchema,
    season: seasonSchema,
    matchDate: matchDateSchema,
    homeTeam: z.string().trim().min(1).max(100),
    awayTeam: z.string().trim().min(1).max(100),
    homeGoals: goalsSchema.nullable(),
    awayGoals: goalsSchema.nullable(),
  })
  .strict()
  .refine(
    (match) =>
      match.homeTeam !== match.awayTeam &&
      (match.homeGoals === null) === (match.awayGoals === null),
    "Invalid teams or partial score",
  );
export type FootballMatch = z.infer<typeof footballMatchSchema>;
export const coverageSchema = z
  .object({
    competition: competitionSchema,
    season: seasonSchema,
    status: z.enum(["available", "missing", "rejected", "error"]),
    received: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    results: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    excludedPlayoffs: z.number().int().nonnegative(),
    pastUnscored: z.number().int().nonnegative(),
    latestCompletedDate: matchDateSchema.nullable(),
    issues: z.array(z.string()),
  })
  .strict();
export type FootballCoverage = z.infer<typeof coverageSchema>;
export const footballSnapshotSchema = z
  .object({
    source: z
      .object({
        name: z.literal("OpenFootball"),
        revision: z.string().regex(/^[a-f0-9]{40}$/),
        retrievedAt: z.iso.datetime(),
        license: z.literal("CC0-1.0"),
        asOf: matchDateSchema,
      })
      .strict(),
    matches: z.array(footballMatchSchema).max(12000),
    coverage: z.array(coverageSchema).max(12),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.source.asOf > snapshot.source.retrievedAt.slice(0, 10))
      context.addIssue({
        code: "custom",
        message: "Audit day cannot follow retrieval day",
        path: ["source", "asOf"],
      });
    const coverageKeys = new Set<string>();
    for (const [index, coverage] of snapshot.coverage.entries()) {
      const key = `${coverage.season}/${coverage.competition}`;
      if (coverageKeys.has(key))
        context.addIssue({
          code: "custom",
          message: "Duplicate coverage entry",
          path: ["coverage", index],
        });
      coverageKeys.add(key);
      const matches = snapshot.matches.filter(
        (match) =>
          match.season === coverage.season &&
          match.competition === coverage.competition,
      );
      const summary = summarizeMatches(matches, snapshot.source.asOf);
      if (
        Object.entries(summary).some(
          ([field, value]) => coverage[field as keyof typeof summary] !== value,
        ) ||
        (coverage.status !== "available" && matches.length > 0) ||
        (coverage.status === "available" &&
          coverage.received !== coverage.accepted + coverage.excludedPlayoffs)
      )
        context.addIssue({
          code: "custom",
          message: "Coverage does not match accepted records",
          path: ["coverage", index],
        });
    }
    const ids = new Set<string>();
    for (const [index, match] of snapshot.matches.entries()) {
      if (ids.has(match.id) || match.id !== footballMatchId(match))
        context.addIssue({
          code: "custom",
          message: "Duplicate or invalid match identity",
          path: ["matches", index, "id"],
        });
      ids.add(match.id);
      if (
        !snapshot.coverage.some(
          (coverage) =>
            coverage.status === "available" &&
            coverage.competition === match.competition &&
            coverage.season === match.season,
        )
      )
        context.addIssue({
          code: "custom",
          message: "Match has no accepted source file",
          path: ["matches", index],
        });
      if (
        !withinSeason(match.matchDate, match.season) ||
        (match.homeGoals !== null && match.matchDate >= snapshot.source.asOf)
      )
        context.addIssue({
          code: "custom",
          message: "Match date outside accepted range",
          path: ["matches", index, "matchDate"],
        });
    }
  });
export type FootballSnapshot = z.infer<typeof footballSnapshotSchema>;

export function footballMatchId(
  match: Pick<
    FootballMatch,
    "competition" | "season" | "homeTeam" | "awayTeam"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        match.competition,
        match.season,
        match.homeTeam,
        match.awayTeam,
      ]),
    )
    .digest("hex");
}
function withinSeason(date: string, season: string) {
  const year = Number(season.slice(0, 4));
  return date >= `${year}-07-01` && date < `${year + 1}-07-01`;
}
export function emptyCoverage(
  competition: FootballMatch["competition"],
  season: string,
): FootballCoverage {
  return {
    competition,
    season,
    status: "available",
    received: 0,
    accepted: 0,
    results: 0,
    upcoming: 0,
    excludedPlayoffs: 0,
    pastUnscored: 0,
    latestCompletedDate: null,
    issues: [],
  };
}
const rawMatchSchema = z.object({
  date: matchDateSchema,
  team1: z.string().trim().min(1).max(100),
  team2: z.string().trim().min(1).max(100),
  score: z
    .union([
      z.tuple([goalsSchema, goalsSchema]),
      z.object({ ft: z.tuple([goalsSchema, goalsSchema]) }),
    ])
    .nullish(),
});

export function normalizeFootballFile(
  input: unknown,
  options: {
    competition: FootballMatch["competition"];
    season: string;
    asOf: string;
  },
): { matches: FootballMatch[]; coverage: FootballCoverage } {
  competitionSchema.parse(options.competition);
  seasonSchema.parse(options.season);
  matchDateSchema.parse(options.asOf);
  const coverage = emptyCoverage(options.competition, options.season);
  const envelope = z
    .object({ name: z.string(), matches: z.array(z.unknown()).max(1000) })
    .safeParse(input);
  if (!envelope.success)
    return {
      matches: [],
      coverage: {
        ...coverage,
        status: "rejected",
        issues: ["Expected a matches array of at most 1000 records."],
      },
    };
  const names = {
    "en.1": "English Premier League",
    "en.2": "English Championship",
    "en.3": "English League One",
    "en.4": "English League Two",
  };
  const expectedName = `${names[options.competition]} ${options.season.replace("-", "/")}`;
  if (envelope.data.name !== expectedName)
    return {
      matches: [],
      coverage: {
        ...coverage,
        status: "rejected",
        issues: [`Expected source name ${expectedName}.`],
      },
    };
  coverage.received = envelope.data.matches.length;
  const matches: FootballMatch[] = [];
  const ids = new Set<string>();
  let invalid = 0;
  const reject = (index: number, reason: string) => {
    invalid++;
    if (coverage.issues.length < 20)
      coverage.issues.push(`Row ${index + 1}: ${reason}`);
  };
  for (const [index, raw] of envelope.data.matches.entries()) {
    const round = z.object({ round: z.string() }).safeParse(raw);
    if (
      round.success &&
      /play[- ]?offs?|\bfinals?\b|semifinals?/i.test(round.data.round)
    ) {
      coverage.excludedPlayoffs++;
      continue;
    }
    const parsed = rawMatchSchema.safeParse(raw);
    if (!parsed.success) {
      reject(index, "Malformed date, teams or full-time score.");
      continue;
    }
    const row = parsed.data;
    if (!withinSeason(row.date, options.season)) {
      reject(index, "Date outside the declared July–June season.");
      continue;
    }
    if (row.team1 === row.team2) {
      reject(index, "A team cannot play itself.");
      continue;
    }
    const score = Array.isArray(row.score) ? row.score : row.score?.ft;
    if (score && row.date >= options.asOf) {
      reject(index, "Scored match is on or after the audit day.");
      continue;
    }
    const identity = {
      competition: options.competition,
      season: options.season,
      homeTeam: row.team1,
      awayTeam: row.team2,
    };
    const id = footballMatchId(identity);
    if (ids.has(id)) {
      reject(index, "Duplicate home/away pair in a regular season.");
      continue;
    }
    ids.add(id);
    matches.push({
      ...identity,
      id,
      matchDate: row.date,
      homeGoals: score?.[0] ?? null,
      awayGoals: score?.[1] ?? null,
    });
  }
  if (invalid)
    return {
      matches: [],
      coverage: {
        ...coverage,
        status: "rejected",
        issues: [
          ...coverage.issues,
          `${invalid} invalid records; entire file excluded.`,
        ],
      },
    };
  Object.assign(coverage, summarizeMatches(matches, options.asOf));
  if (coverage.pastUnscored)
    coverage.issues.push(
      `${coverage.pastUnscored} earlier fixtures have no full-time result; freshness is not established.`,
    );
  return { matches, coverage };
}

function summarizeMatches(matches: FootballMatch[], asOf: string) {
  return {
    accepted: matches.length,
    results: matches.filter((match) => match.homeGoals !== null).length,
    upcoming: matches.filter(
      (match) => match.matchDate > asOf && match.homeGoals === null,
    ).length,
    pastUnscored: matches.filter(
      (match) => match.matchDate < asOf && match.homeGoals === null,
    ).length,
    latestCompletedDate:
      matches
        .filter((match) => match.homeGoals !== null)
        .map((match) => match.matchDate)
        .sort()
        .at(-1) ?? null,
  };
}
