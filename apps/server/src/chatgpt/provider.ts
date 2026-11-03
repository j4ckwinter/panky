import { z } from "zod";
import type {
  ContextMessage,
  ModelProvider,
  ProviderEvent,
  ToolDefinition,
} from "../providers/provider.js";
import { TaskError } from "../task-error.js";

const eventSchema = z.object({
  type: z.string(),
  delta: z.string().max(16000).optional(),
});
export class ChatGPTProvider implements ModelProvider {
  constructor(
    private readonly model: string,
    private readonly request: (
      body: unknown,
      signal: AbortSignal,
    ) => Promise<Response>,
  ) {}
  async *stream(
    history: readonly ContextMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      signal.throwIfAborted();
      if (tools.length)
        throw new TaskError(
          "ChatGPT subscription tools are not enabled in this prototype.",
        );
      const input = history.map((message) => {
        if (
          message.role === "tool" ||
          (message.role === "assistant" && message.toolCall)
        )
          throw new TaskError(
            "Start a new chat to use the ChatGPT subscription with a tool-free history.",
          );
        return {
          role: message.role === "system" ? "developer" : message.role,
          content: message.content,
        };
      });
      const response = await this.request(
        { model: this.model, input, store: false, stream: true },
        signal,
      );
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new TaskError(
          "ChatGPT could not start this response. Check your connection, model and plan limits.",
        );
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffer = "";
      let bytes = 0;
      let output = 0;
      let events = 0;
      let complete = false;
      const parse = (block: string): ProviderEvent | null => {
        if (++events > 8192 || block.length > 65536)
          throw new Error("Oversized stream");
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") return null;
        const event = eventSchema.parse(JSON.parse(data));
        if (complete) throw new Error("Event after completion");
        if (event.type === "response.completed") {
          complete = true;
          return null;
        }
        if (
          ["response.failed", "response.incomplete", "error"].includes(
            event.type,
          )
        )
          throw new TaskError(
            "ChatGPT did not complete this response. Check your plan limits or reconnect; the request was not retried.",
          );
        if (event.type === "response.output_text.delta") {
          if (event.delta === undefined) throw new Error("Missing text");
          output += event.delta.length;
          if (output > 16000)
            throw new TaskError(
              "The provider response exceeded the output limit.",
            );
          return { type: "delta", text: event.delta };
        }
        if (
          event.type.includes("function_call") ||
          event.type.includes("custom_tool_call")
        )
          throw new TaskError("ChatGPT requested an unsupported tool.");
        return null;
      };
      while (true) {
        signal.throwIfAborted();
        const part = await reader.read();
        if (part.done) {
          buffer += decoder.decode();
          break;
        }
        bytes += part.value.length;
        if (bytes > 1048576) throw new Error("Oversized stream");
        buffer += decoder.decode(part.value, { stream: true });
        buffer = buffer.replaceAll("\r\n", "\n");
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const event = parse(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          if (event) yield event;
        }
        if (buffer.length > 65536) throw new Error("Oversized event");
      }
      if (buffer.trim()) {
        const event = parse(buffer);
        if (event) yield event;
      }
      signal.throwIfAborted();
      if (!complete)
        throw new TaskError("ChatGPT ended without completing its response.");
      yield { type: "complete" };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof TaskError) throw error;
      throw new TaskError(
        "ChatGPT could not complete the request. Check your connection or reconnect locally.",
      );
    } finally {
      await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }
}
