import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { mockInterviewReply } from "../interview/mock.js";
import {
  interviewInstructions,
  generalInterviewInstructions,
  transcriptionInstructions,
} from "../interview/prompt.js";

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
export interface ModelProvider {
  stream(
    history: readonly ContextMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
}
export class MockProvider implements ModelProvider {
  constructor(private readonly delayMs = 35) {}
  async *stream(
    history: readonly ContextMessage[],
    _tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    signal.throwIfAborted();
    const prompt =
      history.findLast((message) => message.role === "user")?.content ?? "";
    const toolResult = history.at(-1);
    const interview = history.some(
      (message) =>
        message.role === "system" &&
        [interviewInstructions, generalInterviewInstructions].some(
          (base) =>
            message.content === base ||
            message.content === `${base}\n${transcriptionInstructions}`,
        ),
    );
    const demo =
      prompt.trim().toLowerCase().replace(/\s+/gu, " ") ===
      "what is the current date and time?";
    if (!interview && demo && toolResult?.role !== "tool") {
      yield {
        type: "tool_call",
        callId: "current-datetime",
        name: "get_current_datetime",
        arguments: {},
      };
      return;
    }
    const response = interview
      ? mockInterviewReply(
          z.object({ question: z.string() }).parse(JSON.parse(prompt)).question,
        )
      : demo && toolResult?.role === "tool"
        ? `The current date and time returned by get_current_datetime is ${toolResult.content}.`
        : `This is a mock response from Panky. You said: “${prompt}”\n\nYour conversation is saved on your backend. I’m ready for a real model in a later milestone; for now, this reply is deterministic and no AI model or tools were used.`;
    for (const text of response.match(/.{1,24}/gsu) ?? []) {
      await setTimeout(this.delayMs, undefined, { signal });
      yield { type: "delta", text };
    }
    yield { type: "complete" };
  }
}
