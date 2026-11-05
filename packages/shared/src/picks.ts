import { z } from "zod";

const outcomes = (value: z.ZodNumber) =>
  z.object({ home: value, draw: value, away: value }).strict();
const fixtureBase = {
  id: z.string().min(1).max(80),
  competition: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  probabilities: outcomes(z.number().min(0).max(1)),
  evidence: z.array(z.string()),
  caveats: z.array(z.string()),
};
export const realPickFixtureSchema = z
  .object({
    ...fixtureBase,
    sample: z.literal(false),
    matchDate: z.iso.date(),
    prediction: z
      .object({
        modelVersion: z.string().min(1),
        recordedAt: z.iso.datetime(),
        sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
        sourceRetrievedAt: z.iso.datetime(),
        trainingThrough: z.iso.date(),
        trainingMatches: z.number().int().nonnegative(),
        homeMatches: z.number().int().nonnegative(),
        awayMatches: z.number().int().nonnegative(),
        expectedGoals: z
          .object({ home: z.number().positive(), away: z.number().positive() })
          .strict(),
      })
      .strict(),
  })
  .strict();
export const pickFixtureSchema = z.discriminatedUnion("sample", [
  z
    .object({
      ...fixtureBase,
      sample: z.literal(true),
      kickoff: z.iso.datetime(),
    })
    .strict(),
  realPickFixtureSchema,
]);
export const picksAvailabilitySchema = z
  .object({
    mode: z.enum(["sample", "real"]),
    state: z.enum(["sample", "ready", "held", "error"]),
    message: z.string(),
    sourceRetrievedAt: z.iso.datetime().nullable(),
    lastResultDate: z.iso.date().nullable(),
  })
  .strict();
export type RealPickFixture = z.infer<typeof realPickFixtureSchema>;
export type PicksAvailability = z.infer<typeof picksAvailabilitySchema>;
export const pickMessageSchema = z
  .object({
    id: z.uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    status: z.enum(["running", "completed", "interrupted", "failed"]),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const picksSchema = z
  .object({
    fixtures: z.array(pickFixtureSchema),
    availability: picksAvailabilitySchema,
  })
  .strict();
export const pickAnalysisSchema = z
  .object({ messages: z.array(pickMessageSchema) })
  .strict();
export const pickQuestionSchema = z
  .object({ question: z.string().trim().min(1).max(2000) })
  .strict();
export type PickFixture = z.infer<typeof pickFixtureSchema>;
export type PickMessage = z.infer<typeof pickMessageSchema>;

export const pickResultSchema = z
  .object({
    homeGoals: z.number().int().min(0).max(30),
    awayGoals: z.number().int().min(0).max(30),
    outcome: z.enum(["home", "draw", "away"]),
    matchDate: z.iso.date(),
    recordedAt: z.iso.datetime(),
    sourceRetrievedAt: z.iso.datetime(),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  })
  .strict();
export const pickHistoryEntrySchema = z
  .object({
    fixture: realPickFixtureSchema,
    result: pickResultSchema.nullable(),
    revisions: z.array(pickResultSchema),
    status: z.enum(["upcoming", "awaiting", "scored", "excluded"]),
    exclusionReason: z.string().nullable(),
  })
  .strict();
export const pickPerformanceSchema = z
  .object({
    modelVersion: z.string(),
    recorded: z.number().int().nonnegative(),
    scored: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1).nullable(),
    brier: z.number().nonnegative().nullable(),
    logLoss: z.number().nonnegative().nullable(),
  })
  .strict();
export const picksHistorySchema = z
  .object({
    history: z.array(pickHistoryEntrySchema),
    performance: z.array(pickPerformanceSchema),
  })
  .strict();
export type PickResult = z.infer<typeof pickResultSchema>;
export type PickHistoryEntry = z.infer<typeof pickHistoryEntrySchema>;
export type PickPerformance = z.infer<typeof pickPerformanceSchema>;
export type PicksHistory = z.infer<typeof picksHistorySchema>;
export function mostLikelyPickOutcome(
  probabilities: RealPickFixture["probabilities"],
): PickResult["outcome"] {
  return (["home", "draw", "away"] as const).reduce(
    (best, outcome) =>
      probabilities[outcome] > probabilities[best] ? outcome : best,
    "home",
  );
}
