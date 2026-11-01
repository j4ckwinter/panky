import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { parseArgs } from "node:util";
import {
  conversationSchema,
  historySchema,
  type StreamEvent,
  streamEventSchema,
} from "@panky/shared";
import { loadConfig } from "../apps/server/src/config.js";
import { createApp } from "../apps/server/src/http.js";
import { dateTimeTool } from "../apps/server/src/tools.js";

const { values } = parseArgs({
  options: {
    run: { type: "boolean", default: false },
    model: { type: "string", default: "panky-qwen3:4b" },
    endpoint: { type: "string", default: "http://127.0.0.1:11434" },
  },
});

if (!values.run) {
  process.stdout.write(
    "Opt-in real-model evaluation: corepack pnpm exec tsx scripts/evaluate-ollama.ts --run [--model panky-qwen3:4b] [--endpoint http://127.0.0.1:11434]\nUses an isolated in-memory database; requires a locally installed Ollama model.\n",
  );
} else {
  const token = randomBytes(32).toString("hex");
  const config = loadConfig({
    AUTH_TOKEN: token,
    DATABASE_PATH: ":memory:",
    MODEL_PROVIDER: "ollama",
    MODEL_NAME: values.model,
    MODEL_ENDPOINT: values.endpoint,
    MODEL_CONTEXT_LENGTH: "4096",
    HISTORY_MAX_CHARS: "8000",
    MAX_TASK_DURATION_MS: "120000",
  });
  const deadline = AbortSignal.timeout(900000);
  let failNextTool = false;
  const app = createApp(config, undefined, [
    {
      ...dateTimeTool,
      async execute(input, signal) {
        if (failNextTool) {
          failNextTool = false;
          throw new Error("Intentional isolated evaluation tool failure");
        }
        return dateTimeTool.execute(input, signal);
      },
    },
  ]);
  const results: Array<{
    name: string;
    passed: boolean;
    firstDeltaMs: number | null;
    durationMs: number;
    output: string;
    status: string;
    errors: string[];
    toolResults: unknown[];
    historyMatches: boolean;
  }> = [];
  const metadata: Record<string, unknown> = {};
  const metadataRequest = async (path: string) => {
    try {
      const response = await fetch(new URL(path, config.MODEL_ENDPOINT), {
        redirect: "error",
        signal: AbortSignal.any([deadline, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) return { error: `HTTP ${response.status}` };
      return await response.json();
    } catch {
      return { error: "Ollama metadata request failed or timed out" };
    }
  };
  try {
    metadata.version = await metadataRequest("/api/version");
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Evaluation server did not bind TCP");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (path: string, init?: RequestInit) =>
      fetch(`${origin}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(125000)]),
      });
    const conversation = async () => {
      const response = await request("/api/conversations", { method: "POST" });
      if (!response.ok)
        throw new Error(
          `Conversation creation failed: HTTP ${response.status}`,
        );
      return conversationSchema.parse(await response.json()).id;
    };
    const submit = async (
      name: string,
      id: string,
      content: string,
      accepts: (output: string, events: StreamEvent[]) => boolean,
    ) => {
      const started = performance.now();
      let firstDeltaMs: number | null = null;
      const events: StreamEvent[] = [];
      const response = await request(`/api/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, includeActivity: true }),
      });
      if (!response.ok || !response.body)
        throw new Error(`Submission failed: HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffer = "";
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) {
            buffer += decoder.decode();
            break;
          }
          bytes += part.value.byteLength;
          if (bytes > 1048576)
            throw new Error("Evaluation stream exceeded its byte limit");
          buffer += decoder.decode(part.value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (!frame.startsWith("data: "))
              throw new Error("Invalid SSE frame");
            const event = streamEventSchema.parse(JSON.parse(frame.slice(6)));
            if (event.type === "delta" && firstDeltaMs === null)
              firstDeltaMs = Math.round(performance.now() - started);
            events.push(event);
          }
        }
        if (buffer.trim()) throw new Error("Incomplete SSE frame");
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const durationMs = Math.round(performance.now() - started);
      const output = events
        .filter((event) => event.type === "delta")
        .map((event) => event.text)
        .join("");
      const terminal = events.findLast((event) => event.type === "done");
      const status =
        terminal?.type === "done" ? terminal.run.status : "missing_terminal";
      const historyResponse = await request(`/api/conversations/${id}`);
      const history = historySchema.parse(await historyResponse.json());
      const historyMatches =
        terminal?.type === "done" &&
        history.messages.some(
          (message) =>
            message.id === terminal.message.id &&
            message.content === output &&
            message.status === terminal.message.status,
        ) &&
        history.runs.some(
          (run) => run.id === terminal.run.id && run.status === status,
        );
      const toolResults = events.flatMap((event) =>
        event.type === "activity" && event.activity.kind === "tool_completed"
          ? [event.activity.result]
          : [],
      );
      const result = {
        name,
        passed: historyMatches && accepts(output, events),
        firstDeltaMs,
        durationMs,
        output,
        status,
        errors: events.flatMap((event) =>
          event.type === "error"
            ? [event.error]
            : event.type === "done" && event.run.error
              ? [event.run.error]
              : [],
        ),
        toolResults,
        historyMatches,
      };
      results.push(result);
      process.stderr.write(
        `${name}: ${result.passed ? "PASS" : "FAIL"} (${durationMs} ms)\n`,
      );
    };
    const completed = (events: StreamEvent[]) =>
      events.some(
        (event) => event.type === "done" && event.run.status === "completed",
      );
    const historyId = await conversation();
    await submit(
      "exact_instruction",
      historyId,
      "Reply with exactly PANKY_READY and no other text.",
      (output, events) => completed(events) && output.trim() === "PANKY_READY",
    );
    await submit(
      "history_store",
      historyId,
      "Remember this code for my next message: violet-cedar-731. Reply with exactly SAVED.",
      (output, events) => completed(events) && output.trim() === "SAVED",
    );
    await submit(
      "history_recall",
      historyId,
      "What was the code I asked you to remember? Reply with only that code.",
      (output, events) =>
        completed(events) && output.trim() === "violet-cedar-731",
    );
    const clockPrompt =
      "Call get_current_datetime now. Reply with the exact complete timestamp field returned by the tool, preserving every character, and no other text.";
    const clockMatches = (output: string, events: StreamEvent[]) => {
      const tool = events.find(
        (event) =>
          event.type === "activity" && event.activity.kind === "tool_completed",
      );
      if (tool?.type !== "activity" || tool.activity.kind !== "tool_completed")
        return false;
      const result = tool.activity.result;
      return (
        completed(events) &&
        typeof result === "object" &&
        result !== null &&
        "timestamp" in result &&
        typeof result.timestamp === "string" &&
        "timezone" in result &&
        result.timezone === "UTC" &&
        Number.isFinite(Date.parse(result.timestamp)) &&
        output.trim() === result.timestamp
      );
    };
    for (let attempt = 1; attempt <= 2; attempt++)
      await submit(
        `clock_${attempt}`,
        await conversation(),
        clockPrompt,
        clockMatches,
      );
    const recoveryId = await conversation();
    failNextTool = true;
    await submit(
      "tool_failure",
      recoveryId,
      clockPrompt,
      (_output, events) =>
        !failNextTool &&
        events.some(
          (event) =>
            event.type === "done" &&
            event.run.status === "failed" &&
            event.run.error === "The tool could not complete its request.",
        ),
    );
    failNextTool = false;
    await submit(
      "tool_recovery",
      recoveryId,
      "Try again. " + clockPrompt,
      clockMatches,
    );
    metadata.runningModels = await metadataRequest("/api/ps");
  } catch (error) {
    metadata.failure =
      error instanceof Error ? error.message : "Evaluation failed";
    process.exitCode = 1;
  } finally {
    await app.close();
    const passed =
      results.length === 7 &&
      results.every((result) => result.passed) &&
      !metadata.failure;
    if (!passed) process.exitCode = 1;
    process.stdout.write(
      JSON.stringify(
        {
          evaluatedAt: new Date().toISOString(),
          model: config.MODEL_NAME,
          contextLength: config.MODEL_CONTEXT_LENGTH,
          historyMaxChars: config.HISTORY_MAX_CHARS,
          taskTimeoutMs: config.MAX_TASK_DURATION_MS,
          database: ":memory:",
          passed,
          metadata,
          results,
        },
        null,
        2,
      ) + "\n",
    );
  }
}
