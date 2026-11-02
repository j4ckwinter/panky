import { z } from "zod";

export const interviewInputSchema = z
  .object({ experience: z.string().trim().max(4000) })
  .strict();

export type InterviewInput = z.infer<typeof interviewInputSchema>;
