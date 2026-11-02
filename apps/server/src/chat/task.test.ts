import assert from "node:assert/strict";
import { once } from "node:events";
import { afterEach, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import {
  cancelResponseSchema,
  conversationSchema,
  historySchema,
  type StreamEvent,
  streamEventSchema,
} from "@panky/shared";
import { loadConfig } from "../config.js";
import { createApp } from "../http.js";
import {
  type ModelProvider,
  type ProviderEvent,
} from "../providers/provider.js";
import { MockProvider } from "../providers/mock.js";
import { dateTimeTool, type Tool } from "./tools.js";

const token = "isolated-task-test-token-with-enough-characters";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture(
  provider: ModelProvider = new MockProvider(0),
  env: NodeJS.ProcessEnv = {},
  tools?: readonly Tool[],
) {
  const app = createApp(
    loadConfig({ AUTH_TOKEN: token, DATABASE_PATH: ":memory:", ...env }),
    provider,
    tools,
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert(address && typeof address !== "string");
  cleanup.push(() => app.close());
  const request = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  const conversation = conversationSchema.parse(
    await (await request("/api/conversations", { method: "POST" })).json(),
  );
  const submit = (content = "What is the current date and time?") =>
    request(`/api/conversations/${conversation.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, includeActivity: true }),
    });
  const history = async () =>
    historySchema.parse(
      await (await request(`/api/conversations/${conversation.id}`)).json(),
    );
  return { ...app, request, conversation, submit, history };
}
function events(text: string) {
  return text
    .trim()
    .split("\n\n")
    .map((line) => streamEventSchema.parse(JSON.parse(line.slice(6))));
}
function fixed(...items: ProviderEvent[]): ModelProvider {
  return {
    async *stream() {
      yield* items;
    },
  };
}
const call = (
  name = "get_current_datetime",
  args: unknown = {},
): ProviderEvent => ({
  type: "tool_call",
  callId: "call1",
  name,
  arguments: args,
});

test("real tool output travels through two model turns, streams, and survives history refresh", async () => {
  const app = await fixture();
  const before = Date.now();
  const stream = events(await (await app.submit()).text());
  const saved = await app.history();
  assert.equal(saved.runs[0]?.status, "completed");
  assert.equal(stream.at(-1)?.type, "done");
  const completed = saved.activities.find(
    (item) => item.kind === "tool_completed",
  );
  assert(completed?.kind === "tool_completed");
  const result = completed.result as { timestamp: string; timezone: string };
  assert.equal(result.timezone, "UTC");
  assert(
    Date.parse(result.timestamp) >= before &&
      Date.parse(result.timestamp) <= Date.now(),
  );
  assert(saved.messages[1]?.content.includes(JSON.stringify(result)));
  assert.deepEqual(
    saved.activities.map((item) => item.kind),
    [
      "run_started",
      "model_step",
      "tool_requested",
      "tool_completed",
      "model_step",
      "run_finished",
    ],
  );
  assert.deepEqual(
    saved.activities.map((item) => item.sequence),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual((await app.history()).activities, saved.activities);
});

test("explicit cancel is authenticated, idempotent, and produces a cancelled terminal stream", async () => {
  const app = await fixture(new MockProvider(100));
  const response = await app.submit(
    "a long enough response to cancel before completion",
  );
  const reader = response.body?.getReader();
  assert(reader);
  const first = await reader.read();
  const initial = new TextDecoder().decode(first.value);
  const start = events(initial).find((item) => item.type === "start");
  assert(start?.type === "start");
  const path = `/api/runs/${start.run.id}/cancel`;
  assert.equal(
    (
      await app.request(path, {
        method: "POST",
        headers: { Authorization: "" },
      })
    ).status,
    401,
  );
  const result = cancelResponseSchema.parse(
    await (await app.request(path, { method: "POST" })).json(),
  );
  assert.equal(result.run.status, "cancelled");
  assert.deepEqual(
    cancelResponseSchema.parse(
      await (await app.request(path, { method: "POST" })).json(),
    ),
    result,
  );
  let body = initial;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    body += new TextDecoder().decode(part.value);
  }
  const done = events(body).at(-1);
  assert(done?.type === "done");
  assert.equal(done.run.status, "cancelled");
  assert.equal((await app.history()).messages[1]?.status, "interrupted");
  assert.equal(app.chat.busy, false);
});

test("cancellation during a provider turn prevents a subsequent tool even if provider ignores abort briefly", async () => {
  let release: (() => void) | undefined;
  let called = 0;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const provider: ModelProvider = {
    async *stream() {
      await waiting;
      yield call();
    },
  };
  const app = await fixture(provider, {}, [
    {
      ...dateTimeTool,
      async execute() {
        called++;
        return {};
      },
    },
  ]);
  const response = await app.submit();
  const reader = response.body?.getReader();
  assert(reader);
  await reader.read();
  const run = app.store.runs(app.conversation.id)[0];
  assert(run);
  const cancellation = app.chat.cancel(run.id);
  assert.equal(app.chat.busy, true);
  assert.equal((await app.submit()).status, 409);
  release?.();
  await cancellation;
  await reader.cancel();
  assert.equal(called, 0);
  assert.equal(app.store.run(run.id)?.status, "cancelled");
  assert.equal(app.chat.busy, false);
});

for (const [name, provider, tools, expected] of [
  ["unknown tool", fixed(call("private_shell")), undefined, "not allowed"],
  [
    "invalid arguments",
    fixed(call("get_current_datetime", { secret: "no" })),
    undefined,
    "invalid tool arguments",
  ],
  [
    "tool failure",
    fixed(call()),
    [
      {
        ...dateTimeTool,
        async execute() {
          throw new Error("private-details");
        },
      },
    ],
    "tool could not",
  ],
  [
    "provider failure",
    fixed({ type: "error" }),
    undefined,
    "provider could not",
  ],
  [
    "missing completion",
    fixed({ type: "delta", text: "partial" }),
    undefined,
    "without completing",
  ],
  [
    "extra output after completion",
    fixed({ type: "complete" }, { type: "delta", text: "invalid" }),
    undefined,
    "invalid response",
  ],
] as const) {
  test(`${name} persists failed status and a safe explanation`, async () => {
    const app = await fixture(provider, {}, tools);
    const stream = events(await (await app.submit()).text());
    const done = stream.at(-1);
    assert(done?.type === "done");
    assert.equal(done.run.status, "failed");
    assert(done.run.error?.includes(expected));
    assert(!JSON.stringify(stream).includes("private-details"));
    assert.equal((await app.history()).runs[0]?.status, "failed");
    assert.equal(app.chat.busy, false);
  });
}

test("step limit and duration limit fail cleanly without a retry", async () => {
  const stepApp = await fixture(fixed(call()), { MAX_TASK_STEPS: "1" });
  const stepDone = events(await (await stepApp.submit()).text()).at(-1);
  assert(stepDone?.type === "done");
  assert.equal(stepDone.run.status, "failed");
  assert(stepDone.run.error?.includes("maximum number"));
  let calls = 0;
  const provider: ModelProvider = {
    async *stream(_history, _tools, signal) {
      calls++;
      await setTimeout(5000, undefined, { signal });
      yield { type: "complete" };
    },
  };
  const timeoutApp = await fixture(provider, { MAX_TASK_DURATION_MS: "100" });
  const timeoutDone = events(await (await timeoutApp.submit()).text()).at(-1);
  assert(timeoutDone?.type === "done");
  assert.equal(timeoutDone.run.status, "failed");
  assert(timeoutDone.run.error?.includes("time limit"));
  assert.equal(calls, 1);
});

test("context budget keeps the newest prompt and reports omitted history", async () => {
  const seen: string[][] = [];
  const provider: ModelProvider = {
    async *stream(history) {
      seen.push(history.map((item) => item.content));
      yield { type: "complete" };
    },
  };
  const app = await fixture(provider, { HISTORY_MAX_CHARS: "8000" });
  await (await app.submit("old message")).text();
  await (await app.submit("x".repeat(8000))).text();
  assert.deepEqual(seen[1], ["", "x".repeat(8000)]);
  const activity = (await app.history()).activities
    .filter((item) => item.kind === "run_started")
    .at(-1);
  assert(activity?.kind === "run_started");
  assert.equal(activity.historyChars, 8000);
  assert.equal(activity.omittedMessages, 1);
});

test("invalid provider runtime output fails without persisting private exception details", async () => {
  const provider: ModelProvider = {
    async *stream() {
      yield JSON.parse('{"type":"unknown"}') as ProviderEvent;
    },
  };
  const app = await fixture(provider);
  const last: StreamEvent | undefined = events(
    await (await app.submit()).text(),
  ).at(-1);
  assert(last?.type === "done");
  assert.equal(last.run.status, "failed");
});

test("cancelling an executing tool propagates abort and holds the slot until tool cleanup settles", async () => {
  const entered = deferred();
  const aborted = deferred();
  const cleanupFinished = deferred();
  let providerTurns = 0;
  let toolCalls = 0;
  let receivedSignal: AbortSignal | undefined;
  const provider: ModelProvider = {
    async *stream() {
      providerTurns++;
      yield call();
    },
  };
  const tool: Tool = {
    ...dateTimeTool,
    async execute(_input, signal) {
      toolCalls++;
      receivedSignal = signal;
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      entered.resolve();
      await aborted.promise;
      await cleanupFinished.promise;
      signal.throwIfAborted();
      return {};
    },
  };
  const app = await fixture(provider, {}, [tool]);
  const response = await app.submit();
  await entered.promise;
  const run = app.store.runs(app.conversation.id)[0];
  assert(run);
  const cancellation = app.chat.cancel(run.id);
  try {
    await aborted.promise;
    assert.equal(receivedSignal?.aborted, true);
    assert.equal(receivedSignal?.reason, "cancelled");
    assert.equal(app.chat.busy, true);
    assert.equal(app.store.run(run.id)?.status, "running");
    assert.equal((await app.submit()).status, 409);
  } finally {
    cleanupFinished.resolve();
  }
  await cancellation;
  const done = events(await response.text()).at(-1);
  assert(done?.type === "done");
  assert.equal(done.run.status, "cancelled");
  assert.equal((await app.history()).runs[0]?.status, "cancelled");
  assert.equal(app.chat.busy, false);
  assert.equal(providerTurns, 1);
  assert.equal(toolCalls, 1);
  assert.equal(
    app.store
      .activities(app.conversation.id)
      .filter((item) => item.kind === "tool_completed").length,
    0,
  );
});

test("duplicate tool call IDs fail before executing the tool a second time", async () => {
  let toolCalls = 0;
  const app = await fixture(fixed(call()), {}, [
    {
      ...dateTimeTool,
      async execute() {
        toolCalls++;
        return { value: "first result" };
      },
    },
  ]);
  const done = events(await (await app.submit()).text()).at(-1);
  assert(done?.type === "done");
  assert.equal(done.run.status, "failed");
  assert(done.run.error?.includes("invalid tool request"));
  assert.equal(toolCalls, 1);
  assert.equal(app.chat.busy, false);
});

test("tool results cannot grow provider context beyond the configured budget", async () => {
  let providerTurns = 0;
  const provider: ModelProvider = {
    async *stream() {
      providerTurns++;
      yield call();
    },
  };
  const app = await fixture(provider, { HISTORY_MAX_CHARS: "8000" }, [
    {
      ...dateTimeTool,
      async execute() {
        return { value: "actual tool output" };
      },
    },
  ]);
  const done = events(await (await app.submit("x".repeat(8000))).text()).at(-1);
  assert(done?.type === "done");
  assert.equal(done.run.status, "failed");
  assert(done.run.error?.includes("context budget"));
  assert.equal(providerTurns, 1);
  assert.equal(app.chat.busy, false);
});

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
