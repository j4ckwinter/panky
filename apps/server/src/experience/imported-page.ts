import { EXPERIENCE_LIMITS } from "@panky/shared";
import { z } from "zod";

export const importedPageSchema = z
  .object({
    pageId: z.uuid().transform((id) => id.toLowerCase()),
    title: z.string().trim().min(1).max(EXPERIENCE_LIMITS.titleChars),
    passages: z
      .array(
        z.object({
          blockId: z.uuid().transform((id) => id.toLowerCase()),
          text: z.string().trim().min(1).max(EXPERIENCE_LIMITS.passageChars),
        }),
      )
      .max(EXPERIENCE_LIMITS.passages),
    warnings: z
      .array(z.string().max(EXPERIENCE_LIMITS.warningChars))
      .max(EXPERIENCE_LIMITS.warnings),
  })
  .refine(
    (page) =>
      page.passages.reduce(
        (total, passage) => total + passage.text.length,
        0,
      ) <= EXPERIENCE_LIMITS.totalChars,
  );

export type ImportedPage = z.infer<typeof importedPageSchema>;
