import { z } from "zod";

const outcomes = (value: z.ZodNumber) =>
  z.object({ home: value, draw: value, away: value }).strict();
export const pickFixtureSchema = z
  .object({
    id: z.string().min(1).max(80),
    competition: z.string(),
    homeTeam: z.string(),
    awayTeam: z.string(),
    kickoff: z.iso.datetime(),
    sample: z.literal(true),
    probabilities: outcomes(z.number().min(0).max(1)),
    evidence: z.array(z.string()),
    caveats: z.array(z.string()),
  })
  .strict();
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
  .object({ fixtures: z.array(pickFixtureSchema) })
  .strict();
export const pickAnalysisSchema = z
  .object({ messages: z.array(pickMessageSchema) })
  .strict();
export const pickQuestionSchema = z
  .object({ question: z.string().trim().min(1).max(2000) })
  .strict();
export type PickFixture = z.infer<typeof pickFixtureSchema>;
export type PickMessage = z.infer<typeof pickMessageSchema>;
