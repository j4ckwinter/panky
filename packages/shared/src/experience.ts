import { z } from "zod";

export const evidenceSchema = z.object({
  sourceId: z.uuid(),
  pageId: z.uuid(),
  blockId: z.uuid(),
  title: z.string().max(300),
  url: z
    .string()
    .regex(/^https:\/\/www\.notion\.so\/[a-f0-9]{32}(?:#[a-f0-9]{32})?$/),
  excerpt: z.string().max(1200),
  importedAt: z.string(),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const experienceSourceSchema = z.object({
  id: z.uuid(),
  pageId: z.uuid(),
  title: z.string().max(300),
  url: z.string(),
  importedAt: z.string(),
  lastAttemptAt: z.string(),
  error: z.string().nullable(),
  warnings: z.array(z.string()),
  passageCount: z.number().int().nonnegative(),
});
export type ExperienceSource = z.infer<typeof experienceSourceSchema>;
export const experienceListSchema = z.object({
  configured: z.boolean(),
  sources: z.array(experienceSourceSchema),
});
export const experienceDetailSchema = z.object({
  source: experienceSourceSchema,
  passages: z.array(evidenceSchema),
});
export const importExperienceSchema = z
  .object({ page: z.string().trim().min(1).max(500) })
  .strict();
