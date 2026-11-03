import { z } from "zod";

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
