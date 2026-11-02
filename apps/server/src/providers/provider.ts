import { z } from "zod";

export type ContextMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCall?: { callId: string; name: string; arguments: unknown };
    }
  | { role: "tool"; content: string; callId: string; name: string };
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
export const providerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string().max(16000) }).strict(),
  z
    .object({
      type: z.literal("tool_call"),
      callId: z.string().min(1).max(100),
      name: z.string().min(1).max(100),
      arguments: z.unknown(),
    })
    .strict(),
  z.object({ type: z.literal("complete") }).strict(),
  z.object({ type: z.literal("error") }).strict(),
]);
export type ProviderEvent = z.infer<typeof providerEventSchema>;
export type ProviderPurpose = "chat" | "interview";

export interface ModelProvider {
  stream(
    history: readonly ContextMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
    purpose?: ProviderPurpose,
  ): AsyncIterable<ProviderEvent>;
}
