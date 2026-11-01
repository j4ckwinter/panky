import { setTimeout } from "node:timers/promises";
import type { Message } from "@panky/shared";

export interface ModelProvider {
  stream(
    history: readonly Message[],
    signal: AbortSignal,
  ): AsyncIterable<string>;
}

export class MockProvider implements ModelProvider {
  constructor(private readonly delayMs = 35) {}

  async *stream(
    history: readonly Message[],
    signal: AbortSignal,
  ): AsyncIterable<string> {
    const prompt =
      history.findLast((message) => message.role === "user")?.content ?? "";
    const response = `This is a mock response from Panky. You said: “${prompt}”\n\nYour conversation is saved on your backend. I’m ready for a real model in a later milestone; for now, this reply is deterministic and no AI model or tools were used.`;
    for (const chunk of response.match(/.{1,24}/gsu) ?? []) {
      await setTimeout(this.delayMs, undefined, { signal });
      yield chunk;
    }
  }
}
