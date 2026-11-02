import { MESSAGE_MAX_CHARS, INTERVIEW_LIMITS } from "./limits.js";
import { z } from "zod";

export const interviewInputSchema = z
  .object({
    experience: z.string().trim().max(INTERVIEW_LIMITS.experienceChars),
    inputSource: z.enum(["typed", "speech"]).default("typed"),
    useExperience: z.boolean().default(true),
    context: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(MESSAGE_MAX_CHARS),
            spokenAnswer: z
              .string()
              .trim()
              .max(INTERVIEW_LIMITS.spokenAnswerChars),
          })
          .strict(),
      )
      .max(INTERVIEW_LIMITS.contextTurns)
      .default([]),
  })
  .strict();

export type InterviewInput = z.input<typeof interviewInputSchema>;
