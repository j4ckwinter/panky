import { z } from "zod";
import { interviewInputSchema } from "./interview.js";

export { type InterviewInput, interviewInputSchema } from "./interview.js";

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const renameConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .strict();
export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status: z.enum(["streaming", "completed", "interrupted"]),
  createdAt: z.string(),
});
export const submissionSchema = z
  .object({
    content: z.string().trim().min(1).max(8000),
    includeActivity: z.boolean().default(false),
    interview: interviewInputSchema.optional(),
  })
  .strict();
export const conversationsSchema = z.array(conversationSchema);
export const runStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export const terminalRunStatusSchema = runStatusSchema.exclude(["running"]);
export const taskRunSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  userMessageId: z.uuid(),
  assistantMessageId: z.uuid(),
  status: runStatusSchema,
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
const activityBase = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  sequence: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export const activitySchema = z.discriminatedUnion("kind", [
  activityBase.extend({
    kind: z.literal("run_started"),
    historyChars: z.number().int(),
    omittedMessages: z.number().int(),
  }),
  activityBase.extend({
    kind: z.literal("model_step"),
    step: z.number().int().positive(),
  }),
  activityBase.extend({
    kind: z.literal("tool_requested"),
    callId: z.string(),
    name: z.string(),
    arguments: z.unknown(),
  }),
  activityBase.extend({
    kind: z.literal("tool_completed"),
    callId: z.string(),
    name: z.string(),
    result: z.unknown(),
  }),
  activityBase.extend({
    kind: z.literal("run_finished"),
    status: terminalRunStatusSchema,
    error: z.string().nullable(),
  }),
]);
export const cancelResponseSchema = z.object({ run: taskRunSchema });
export type TaskRun = z.infer<typeof taskRunSchema>;
export type Activity = z.infer<typeof activitySchema>;
export const historySchema = z.object({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
  runs: z.array(taskRunSchema).default([]),
  activities: z.array(activitySchema).default([]),
});
export const streamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    user: messageSchema,
    assistant: messageSchema,
    run: taskRunSchema,
  }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("activity"), activity: activitySchema }),
  z.object({
    type: z.literal("done"),
    message: messageSchema,
    run: taskRunSchema,
  }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);
export const errorSchema = z.object({ error: z.string() });
export const healthSchema = z.object({
  provider: z.enum(["mock", "ollama"]),
  model: z.string(),
  busy: z.boolean(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;

export {
  type Access,
  type AuthStatus,
  type AuthUser,
  accessSchema,
  authStatusSchema,
  authUserSchema,
  type DeviceSession,
  deviceSessionSchema,
  deviceSessionsSchema,
  googleOptionsSchema,
} from "./auth.js";
