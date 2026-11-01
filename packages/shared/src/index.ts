import { z } from "zod";

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status: z.enum(["streaming", "completed", "interrupted"]),
  createdAt: z.string(),
});
export const submissionSchema = z
  .object({ content: z.string().trim().min(1).max(8000) })
  .strict();
export const conversationsSchema = z.array(conversationSchema);
export const historySchema = z.object({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
});
export const streamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    user: messageSchema,
    assistant: messageSchema,
  }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("done"), message: messageSchema }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);
export const errorSchema = z.object({ error: z.string() });
export const healthSchema = z.object({
  provider: z.literal("mock"),
  model: z.string(),
  busy: z.boolean(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
