import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { mockInterviewReply } from "../interview/mock.js";
import type {
  ContextMessage,
  ModelProvider,
  ProviderEvent,
  ProviderPurpose,
  ToolDefinition,
} from "./provider.js";

export class MockProvider implements ModelProvider {
  constructor(private readonly delayMs = 35) {}
  async *stream(
    history: readonly ContextMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
    purpose: ProviderPurpose = "chat",
  ): AsyncIterable<ProviderEvent> {
    signal.throwIfAborted();
    const rawPrompt =
      history.findLast((message) => message.role === "user")?.content ?? "";
    const sourcedChat = purpose === "sourced-chat";
    const prompt = sourcedChat
      ? z.object({ question: z.string() }).parse(JSON.parse(rawPrompt)).question
      : rawPrompt;
    const toolResult = history.at(-1);
    const interview = purpose === "interview";
    const demo =
      prompt.trim().toLowerCase().replace(/\s+/gu, " ") ===
      "what is the current date and time?";
    const canUseDateTime = tools.some(
      (tool) => tool.name === "get_current_datetime",
    );
    if (!interview && demo && canUseDateTime && toolResult?.role !== "tool") {
      yield {
        type: "tool_call",
        callId: "current-datetime",
        name: "get_current_datetime",
        arguments: {},
      };
      return;
    }
    const response =
      purpose === "picks"
        ? history[0]?.content.includes("saved experimental football prediction")
          ? "These supplied probabilities come from an experimental statistical model. The saved evidence describes its historical sample and limitations; no live team news is available. This is a scripted mock explanation; no AI model was used."
          : "This sample match uses fictional teams, probabilities. The supplied numbers illustrate uncertainty; they are not a validated prediction or a betting recommendation. No live team news is available. This is a mock explanation; no AI model was used."
        : interview
          ? mockInterviewReply(
              z.object({ question: z.string() }).parse(JSON.parse(prompt))
                .question,
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
