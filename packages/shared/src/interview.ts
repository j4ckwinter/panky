import { z } from "zod";

export const interviewInputSchema = z
  .object({
    experience: z.string().trim().max(4000),
    context: z
      .array(
        z
          .object({
            question: z.string().trim().min(1).max(8000),
            spokenAnswer: z.string().trim().max(2000),
          })
          .strict(),
      )
      .max(4)
      .default([]),
  })
  .strict();

export type InterviewInput = z.input<typeof interviewInputSchema>;
