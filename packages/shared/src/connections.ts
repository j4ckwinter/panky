import { z } from "zod";
import { EXPERIENCE_LIMITS, experienceSourceSchema } from "./experience.js";

const workspaceSchema = z.object({ id: z.uuid(), name: z.string().max(200) });
const connectedSchema = z.object({
  workspace: workspaceSchema,
  connectedAt: z.iso.datetime(),
});
export const notionConnectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("disconnected") }),
  connectedSchema.extend({ kind: z.literal("connected") }),
  connectedSchema.extend({ kind: z.literal("reconnect_required") }),
]);
export type NotionConnection = z.infer<typeof notionConnectionSchema>;
export const notionAuthorizationSchema = z.object({
  url: z
    .url()
    .regex(/^https:\/\/api\.notion\.com\/v1\/oauth\/authorize\?[^#\s]+$/),
});

export const notionPageSearchSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    cursor: z.string().min(1).max(1000).optional(),
  })
  .strict();
export const notionPagesSchema = z.object({
  pages: z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string().max(EXPERIENCE_LIMITS.titleChars),
      }),
    )
    .max(20),
  nextCursor: z.string().min(1).max(1000).nullable(),
});
export const notionSourcesSchema = z.object({
  sources: z.array(experienceSourceSchema).max(EXPERIENCE_LIMITS.sources),
});
