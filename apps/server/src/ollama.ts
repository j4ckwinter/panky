import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TaskError } from "./loop.js";
import type {
  ContextMessage,
  ModelProvider,
  ProviderEvent,
  ToolDefinition,
} from "./provider.js";

const toolCallSchema = z.object({
  function: z.object({
    name: z.string().min(1).max(100),
    arguments: z.record(z.string(), z.unknown()),
  }),
});
const chunkSchema = z.object({
  done: z.boolean(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string().max(16000),
    tool_calls: z.array(toolCallSchema).optional(),
  }),
  error: z.never().optional(),
});

export class OllamaProvider implements ModelProvider {
  constructor(
    private readonly options: {
      endpoint: string;
      model: string;
      contextLength: number;
    },
  ) {}

  async *stream(
    history: readonly ContextMessage[],
    tools: readonly ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      signal.throwIfAborted();
      const response = await fetch(
        new URL("/api/chat", this.options.endpoint),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          redirect: "error",
          signal,
          body: JSON.stringify({
            model: this.options.model,
            stream: true,
            think: false,
            options: { num_ctx: this.options.contextLength },
            messages: history.map((message) => ({
              role: message.role,
              content: message.content,
              ...(message.role === "assistant" && message.toolCall
                ? {
                    tool_calls: [
                      {
                        function: {
                          name: message.toolCall.name,
                          arguments: message.toolCall.arguments,
                        },
                      },
                    ],
                  }
                : {}),
              ...(message.role === "tool" && message.name
                ? { tool_name: message.name }
                : {}),
            })),
            tools: tools.map((definition) => ({
              type: "function",
              function: definition,
            })),
          }),
        },
      );
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new TaskError(
          response.status === 404
            ? "Ollama could not find the configured model. Check MODEL_NAME and install the model locally."
            : "Ollama rejected the request. Check the configured model and its tool support.",
        );
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffer = "";
      let bytes = 0;
      let chunks = 0;
      let outputLength = 0;
      let done = false;
      let toolCall: z.infer<typeof toolCallSchema> | undefined;
      const parseLine = (line: string) => {
        if (line.length > 65536 || ++chunks > 4096 || done)
          throw new TaskError(
            "Ollama returned an invalid or oversized response.",
          );
        const parsed = chunkSchema.safeParse(JSON.parse(line));
        if (!parsed.success)
          throw new TaskError("Ollama returned an invalid response.");
        const chunk = parsed.data;
        for (const call of chunk.message.tool_calls ?? []) {
          if (toolCall)
            throw new TaskError(
              "Ollama requested multiple tools in one step. Only one tool per step is supported.",
            );
          toolCall = call;
        }
        outputLength += chunk.message.content.length;
        if (outputLength > 16000)
          throw new TaskError(
            "The provider response exceeded the output limit.",
          );
        done = chunk.done;
        return chunk.message.content;
      };
      while (true) {
        signal.throwIfAborted();
        const part = await reader.read();
        if (part.done) {
          buffer += decoder.decode();
          if (buffer.trim()) {
            const text = parseLine(buffer);
            if (text) yield { type: "delta", text };
          }
          break;
        }
        bytes += part.value.byteLength;
        if (bytes > 1048576)
          throw new TaskError("Ollama returned an oversized response.");
        buffer += decoder.decode(part.value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line.trim()) continue;
          const text = parseLine(line);
          if (text) yield { type: "delta", text };
        }
        if (buffer.length > 65536)
          throw new TaskError("Ollama returned an oversized response.");
      }
      signal.throwIfAborted();
      if (!done)
        throw new TaskError("Ollama ended without completing its response.");
      if (toolCall)
        yield {
          type: "tool_call",
          callId: randomUUID(),
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        };
      else yield { type: "complete" };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof TaskError) throw error;
      throw new TaskError(
        "Ollama could not complete the request. Check that it is running locally and the model is available.",
      );
    } finally {
      await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }
}
