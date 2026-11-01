import type { Message } from "@panky/shared";
import type { Config } from "../config.js";
import {
  type ContextMessage,
  type ModelProvider,
  providerEventSchema,
} from "../providers/provider.js";
import type { ActivityPayload } from "./store.js";
import type { Tool } from "./tools.js";

export class TaskError extends Error {}
export function boundedHistory(messages: readonly Message[], budget: number) {
  const history: ContextMessage[] = [];
  let historyChars = 0;
  let included = 0;
  for (const message of [...messages].reverse()) {
    if (message.status !== "completed") continue;
    if (historyChars + message.content.length > budget) break;
    history.unshift({ role: message.role, content: message.content });
    historyChars += message.content.length;
    included++;
  }
  return {
    history,
    historyChars,
    omittedMessages:
      messages.filter((item) => item.status === "completed").length - included,
  };
}

export async function runLoop(options: {
  history: ContextMessage[];
  provider: ModelProvider;
  tools: readonly Tool[];
  config: Pick<Config, "MAX_TASK_STEPS" | "HISTORY_MAX_CHARS">;
  signal: AbortSignal;
  activity(event: ActivityPayload): Promise<void>;
  delta(text: string): Promise<void>;
}) {
  const { history, provider, tools, config, signal, activity, delta } = options;
  const callIds = new Set<string>();
  for (let step = 1; step <= config.MAX_TASK_STEPS; step++) {
    signal.throwIfAborted();
    await activity({ kind: "model_step", step });
    let terminal = false;
    let complete = false;
    let output = "";
    let call: { callId: string; name: string; arguments?: unknown } | undefined;
    let events = 0;
    for await (const raw of provider.stream(
      history,
      tools.map((tool) => tool.definition),
      signal,
    )) {
      signal.throwIfAborted();
      const parsed = providerEventSchema.safeParse(raw);
      if (!parsed.success || terminal || ++events > 2048)
        throw new TaskError("The provider returned an invalid response.");
      const event = parsed.data;
      if (event.type === "error")
        throw new TaskError("The provider could not complete this task.");
      if (event.type === "delta") {
        output += event.text;
        if (output.length > 16000)
          throw new TaskError(
            "The provider response exceeded the output limit.",
          );
        await delta(event.text);
      } else {
        terminal = true;
        complete = event.type === "complete";
        if (event.type === "tool_call") call = event;
      }
    }
    signal.throwIfAborted();
    if (!terminal)
      throw new TaskError(
        "The provider ended without completing its response.",
      );
    if (complete) return;
    if (!call || callIds.has(call.callId))
      throw new TaskError("The provider returned an invalid tool request.");
    callIds.add(call.callId);
    await activity({
      kind: "tool_requested",
      ...call,
      arguments: call.arguments ?? null,
    });
    const tool = tools.find((item) => item.definition.name === call.name);
    if (!tool)
      throw new TaskError("The provider requested a tool that is not allowed.");
    const args = tool.arguments.safeParse(call.arguments);
    if (!args.success)
      throw new TaskError("The provider supplied invalid tool arguments.");
    signal.throwIfAborted();
    let result: unknown;
    try {
      result = await tool.execute(args.data, signal);
    } catch {
      signal.throwIfAborted();
      throw new TaskError("The tool could not complete its request.");
    }
    signal.throwIfAborted();
    let serialized: string;
    try {
      serialized = JSON.stringify(result);
      if (typeof serialized !== "string" || serialized.length > 8000)
        throw new Error();
    } catch {
      throw new TaskError("The tool returned an invalid or oversized result.");
    }
    await activity({
      kind: "tool_completed",
      callId: call.callId,
      name: call.name,
      result,
    });
    history.push({
      role: "assistant",
      content: output,
      toolCall: { ...call, arguments: call.arguments },
    });
    history.push({
      role: "tool",
      content: serialized,
      callId: call.callId,
      name: call.name,
    });
    if (
      history.reduce(
        (sum, item) =>
          sum +
          item.content.length +
          (item.role === "assistant" && item.toolCall
            ? JSON.stringify(item.toolCall).length
            : 0),
        0,
      ) > config.HISTORY_MAX_CHARS
    )
      throw new TaskError("The task exceeded its context budget.");
  }
  throw new TaskError("The task reached its maximum number of model steps.");
}
