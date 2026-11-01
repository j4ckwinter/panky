import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import {
  conversationSchema,
  historySchema,
  streamEventSchema,
} from "@panky/shared";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { createApp } from "../http.js";
import { OllamaProvider } from "./ollama.js";
import type { ContextMessage, ProviderEvent } from "./provider.js";

async function stub(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    provider: new OllamaProvider({
      endpoint: `http://127.0.0.1:${address.port}`,
      model: "test-model",
      contextLength: 4096,
    }),
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
const chunk = (content: string, done = false, tool_calls?: unknown[]) =>
  JSON.stringify({
    message: {
      role: "assistant",
      content,
      ...(tool_calls ? { tool_calls } : {}),
    },
    done,
  }) + "\n";
const call = { function: { name: "get_current_datetime", arguments: {} } };
const collect = async (
  provider: OllamaProvider,
  signal = new AbortController().signal,
  history: ContextMessage[] = [],
) => {
  const events: ProviderEvent[] = [];
  for await (const event of provider.stream(history, [], signal))
    events.push(event);
  return events;
};

test("Ollama streams fragmented UTF-8 and posts native chat configuration", async () => {
  let requestBody = "";
  await using fixture = await stub(async (request, response) => {
    assert.equal(request.url, "/api/chat");
    assert.equal(request.method, "POST");
    for await (const part of request) requestBody += String(part);
    response.writeHead(200, { "Content-Type": "application/x-ndjson" });
    const payload = Buffer.from(chunk("héllo") + chunk("!", true).trimEnd());
    for (let index = 0; index < payload.length; index += 3) {
      response.write(payload.subarray(index, index + 3));
      await setTimeout(1);
    }
    response.end();
  });
  assert.deepEqual(await collect(fixture.provider), [
    { type: "delta", text: "héllo" },
    { type: "delta", text: "!" },
    { type: "complete" },
  ]);
  assert.deepEqual(JSON.parse(requestBody), {
    model: "test-model",
    stream: true,
    think: false,
    options: { num_ctx: 4096 },
    messages: [],
    tools: [],
  });
});

test("configured Ollama runs an authenticated clock tool turn and persists history", async () => {
  const requests: unknown[] = [];
  await using upstream = await stub(async (request, response) => {
    let body = "";
    for await (const part of request) body += String(part);
    requests.push(JSON.parse(body));
    response.end(
      requests.length === 1
        ? chunk("", true, [call])
        : chunk("The clock tool returned the current time.", true),
    );
  });
  const token = "isolated-test-token-at-least-thirty-two-characters";
  const app = createApp(
    loadConfig({
      AUTH_TOKEN: token,
      DATABASE_PATH: ":memory:",
      MODEL_PROVIDER: "ollama",
      MODEL_NAME: "test-model",
      MODEL_ENDPOINT: upstream.endpoint,
    }),
  );
  try {
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const request = (path: string, init?: RequestInit) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    assert.equal((await fetch(`${base}/api/conversations`)).status, 401);
    const conversation = conversationSchema.parse(
      await (await request("/api/conversations", { method: "POST" })).json(),
    );
    assert.equal(
      (
        await fetch(`${base}/api/conversations/${conversation.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "unauthenticated" }),
        })
      ).status,
      401,
    );
    assert.equal(requests.length, 0);
    const response = await request(
      `/api/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: "What is the current date and time?",
          includeActivity: true,
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/event-stream/,
    );
    const events = (await response.text())
      .trim()
      .split("\n\n")
      .map((line) => streamEventSchema.parse(JSON.parse(line.slice(6))));
    assert(
      events.some(
        (event) => event.type === "delta" && event.text.includes("clock tool"),
      ),
    );
    const done = events.at(-1);
    assert(done?.type === "done");
    assert.equal(done.run.status, "completed");
    const history = historySchema.parse(
      await (await request(`/api/conversations/${conversation.id}`)).json(),
    );
    assert.equal(history.messages.length, 2);
    assert.equal(history.messages[1]?.content, done.message.content);
    assert.equal(history.messages[1]?.status, "completed");
    assert.deepEqual(
      history.activities.map((activity) => activity.kind),
      [
        "run_started",
        "model_step",
        "tool_requested",
        "tool_completed",
        "model_step",
        "run_finished",
      ],
    );
    assert.deepEqual(history.runs, [done.run]);
    assert.equal(requests.length, 2);
    const sent = z
      .object({
        model: z.string(),
        messages: z.array(
          z.object({
            role: z.string(),
            content: z.string(),
            tool_calls: z.array(z.unknown()).optional(),
            tool_name: z.string().optional(),
          }),
        ),
      })
      .parse(requests[1]);
    assert.equal(sent.model, "test-model");
    assert.deepEqual(sent.messages[1]?.tool_calls, [call]);
    assert.equal(sent.messages[2]?.tool_name, "get_current_datetime");
    const completed = history.activities.find(
      (activity) => activity.kind === "tool_completed",
    );
    assert(completed?.kind === "tool_completed");
    assert.equal(sent.messages[2]?.content, JSON.stringify(completed.result));
  } finally {
    await app.close();
  }
});

test("Ollama preserves assistant call and named tool result on the next round", async () => {
  const requests: unknown[] = [];
  await using fixture = await stub(async (request, response) => {
    let body = "";
    for await (const part of request) body += String(part);
    requests.push(JSON.parse(body));
    response.end(
      requests.length === 1
        ? chunk("", false, [call]) + chunk("", true)
        : chunk("Today", true),
    );
  });
  const first = await collect(fixture.provider);
  const event = first[0];
  assert(event?.type === "tool_call");
  const history: ContextMessage[] = [
    {
      role: "assistant",
      content: "",
      toolCall: {
        callId: event.callId,
        name: event.name,
        arguments: event.arguments,
      },
    },
    {
      role: "tool",
      content: "date result",
      name: event.name,
      callId: event.callId,
    },
  ];
  assert.deepEqual(await collect(fixture.provider, undefined, history), [
    { type: "delta", text: "Today" },
    { type: "complete" },
  ]);
  assert.deepEqual(requests[1], {
    model: "test-model",
    stream: true,
    think: false,
    options: { num_ctx: 4096 },
    messages: [
      { role: "assistant", content: "", tool_calls: [call] },
      { role: "tool", content: "date result", tool_name: event.name },
    ],
    tools: [],
  });
});

for (const [name, payload, pattern] of [
  ["malformed JSON", "secret invalid json\n", /could not complete/],
  [
    "invalid shape",
    JSON.stringify({
      done: true,
      message: { role: "user", content: "secret" },
    }),
    /invalid response/,
  ],
  ["provider error", JSON.stringify({ error: "secret" }), /invalid response/],
  ["truncated stream", chunk("partial"), /without completing/],
  ["extra terminal", chunk("", true) + chunk("", true), /invalid or oversized/],
  ["parallel tools", chunk("", true, [call, call]), /multiple tools/],
  [
    "tools across chunks",
    chunk("", false, [call]) + chunk("", true, [call]),
    /multiple tools/,
  ],
  ["oversized line", " ".repeat(65537), /oversized/],
  [
    "oversized output",
    chunk("a".repeat(8001)) + chunk("b".repeat(8000), true),
    /output limit/,
  ],
] satisfies [string, string, RegExp][]) {
  test(`Ollama rejects ${name}`, async () => {
    await using fixture = await stub((_request, response) =>
      response.end(payload),
    );
    await assert.rejects(collect(fixture.provider), pattern);
  });
}

test("Ollama sanitizes HTTP failures without retrying", async () => {
  let count = 0;
  await using fixture = await stub((_request, response) => {
    count++;
    response.writeHead(404);
    response.end("secret local path");
  });
  await assert.rejects(
    collect(fixture.provider),
    /could not find the configured model/,
  );
  assert.equal(count, 1);
});

test("Ollama cancellation interrupts a stalled stream", async () => {
  const controller = new AbortController();
  await using fixture = await stub((_request, response) => {
    response.write(chunk("partial"));
  });
  const events = fixture.provider
    .stream([], [], controller.signal)
    [Symbol.asyncIterator]();
  assert.deepEqual((await events.next()).value, {
    type: "delta",
    text: "partial",
  });
  const pending = events.next();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
