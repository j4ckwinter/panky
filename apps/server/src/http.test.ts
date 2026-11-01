import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import {
  conversationSchema,
  historySchema,
  streamEventSchema,
} from "@panky/shared";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";
import { MockProvider, type ModelProvider } from "./provider.js";
import { Store } from "./store.js";

const token = "test-token-with-at-least-thirty-two-characters";
const origin = "http://localhost:5173";
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(
  provider: ModelProvider = new MockProvider(1),
  path = ":memory:",
) {
  const app = createApp(
    loadConfig({ AUTH_TOKEN: token, DATABASE_PATH: path }),
    provider,
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await app.close();
    }
  };
  cleanups.push(close);
  const request = (path: string, init?: RequestInit) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: origin,
        ...init?.headers,
      },
    });
  const conversation = async () =>
    conversationSchema.parse(
      await (await request("/api/conversations", { method: "POST" })).json(),
    );
  const submit = (id: string, content = "Hello Panky", signal?: AbortSignal) =>
    request(`/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      ...(signal ? { signal } : {}),
    });
  return { ...app, base, request, conversation, submit, close };
}

function events(body: string) {
  return body
    .trim()
    .split("\n\n")
    .map((line) => streamEventSchema.parse(JSON.parse(line.slice(6))));
}

async function untilIdle(app: Awaited<ReturnType<typeof fixture>>) {
  for (let attempt = 0; attempt < 100 && app.chat.busy; attempt++)
    await setTimeout(10);
  assert.equal(app.chat.busy, false);
}

test("all data endpoints require authentication even without Origin", async () => {
  const app = await fixture();
  const conversation = await app.conversation();
  for (const [path, method] of [
    ["/api/health", "GET"],
    ["/api/conversations", "GET"],
    ["/api/conversations", "POST"],
    [`/api/conversations/${conversation.id}`, "GET"],
    [`/api/conversations/${conversation.id}/messages`, "POST"],
  ]) {
    const response = await fetch(`${app.base}${path}`, { method });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
  }
  assert.equal(
    (
      await app.request("/api/health", {
        headers: { Authorization: "Bearer wrong" },
      })
    ).status,
    401,
  );
});

test("both local frontend origins support authenticated requests and preflight", async () => {
  const app = await fixture();
  for (const localOrigin of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]) {
    const preflight = await fetch(`${app.base}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: localOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      localOrigin,
    );
    const response = await app.request("/api/health", {
      headers: { Origin: localOrigin },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      localOrigin,
    );
    const unauthenticated = await fetch(`${app.base}/api/health`, {
      headers: { Origin: localOrigin },
    });
    assert.equal(unauthenticated.status, 401);
  }
});

test("CORS only permits configured origins, methods and request headers", async () => {
  const app = await fixture();
  assert.equal(
    (
      await app.request("/api/health", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const preflight = await fetch(`${app.base}/api/conversations`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "authorization,content-type,ngrok-skip-browser-warning",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), null);
  assert.match(
    preflight.headers.get("access-control-allow-headers") ?? "",
    /ngrok-skip-browser-warning/,
  );
  const noToken = await fetch(`${app.base}/api/health`, {
    headers: { Origin: origin, "ngrok-skip-browser-warning": "1" },
  });
  assert.equal(noToken.status, 401);
  const bad = await fetch(`${app.base}/api/conversations`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "DELETE" },
  });
  assert.equal(bad.status, 403);
});

test("invalid inputs cannot create messages", async () => {
  const app = await fixture();
  const conversation = await app.conversation();
  assert.equal((await app.request("/api/conversations/nope")).status, 400);
  assert.equal(
    (
      await app.request(
        "/api/conversations/00000000-0000-4000-8000-000000000000",
      )
    ).status,
    404,
  );
  for (const body of [
    "{",
    JSON.stringify({ content: " " }),
    JSON.stringify({ content: "x".repeat(8001) }),
    JSON.stringify({ content: "hello", extra: true }),
  ]) {
    const response = await app.request(
      `/api/conversations/${conversation.id}/messages`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
    );
    assert.equal(response.status, 400);
  }
  assert.equal(app.store.messages(conversation.id).length, 0);
});

test("real HTTP streams deltas and persists completed messages across restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "panky-test-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "chat.sqlite");
  const app = await fixture(new MockProvider(1), path);
  const conversation = await app.conversation();
  const response = await app.submit(conversation.id, "Hello 🍋");
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /text\/event-stream/,
  );
  const stream = events(await response.text());
  assert.equal(stream[0]?.type, "start");
  assert.equal(stream.at(-1)?.type, "done");
  const content = stream
    .flatMap((event) => (event.type === "delta" ? event.text : []))
    .join("");
  assert.match(content, /Hello 🍋/);
  assert(stream.filter((event) => event.type === "delta").length > 5);
  await app.close();
  const restarted = await fixture(new MockProvider(1), path);
  const history = historySchema.parse(
    await (
      await restarted.request(`/api/conversations/${conversation.id}`)
    ).json(),
  );
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[0]?.content, "Hello 🍋");
  assert.equal(history.messages[1]?.content, content);
  assert.equal(history.messages[1]?.status, "completed");
  assert.equal(history.conversation.title, "Hello 🍋");
});

test("one response runs globally; rejected submissions leave no messages", async () => {
  const app = await fixture(new MockProvider(5));
  const first = await app.conversation();
  const second = await app.conversation();
  const response = await app.submit(first.id);
  const competing = await app.submit(second.id);
  assert.equal(competing.status, 409);
  assert.equal(app.store.messages(second.id).length, 0);
  await response.text();
  await untilIdle(app);
  assert.equal((await app.submit(second.id)).status, 200);
});

test("disconnect preserves partial reply as interrupted and releases the slot", async () => {
  const app = await fixture(new MockProvider(10));
  const conversation = await app.conversation();
  const controller = new AbortController();
  const response = await app.submit(
    conversation.id,
    "hello",
    controller.signal,
  );
  const reader = response.body?.getReader();
  assert(reader);
  await reader.read();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => undefined);
  await untilIdle(app);
  const saved = app.store.messages(conversation.id);
  assert.equal(saved.length, 2);
  assert.equal(saved[0]?.status, "completed");
  assert.equal(saved[1]?.status, "interrupted");
  assert((saved[1]?.content.length ?? 0) > 0);
  assert.equal((await app.submit(conversation.id)).status, 200);
});

test("provider failures persist interruption and allow another response", async () => {
  const provider: ModelProvider = {
    async *stream() {
      yield "partial";
      throw new Error("private provider details");
    },
  };
  const app = await fixture(provider);
  const conversation = await app.conversation();
  const stream = events(await (await app.submit(conversation.id)).text());
  assert.equal(stream.at(-1)?.type, "error");
  assert(!JSON.stringify(stream).includes("private provider details"));
  assert.equal(app.store.messages(conversation.id)[1]?.status, "interrupted");
  assert.equal(app.chat.busy, false);
});

test("startup recovers unfinished messages without rerunning the provider", () => {
  const directory = mkdtempSync(join(tmpdir(), "panky-recovery-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "chat.sqlite");
  const store = new Store(path);
  const conversation = store.createConversation();
  const { assistant } = store.beginResponse(conversation.id, "unfinished");
  assistant.content = "persisted partial";
  store.saveMessage(assistant);
  store.close();
  const recovered = new Store(path);
  assert.equal(recovered.messages(conversation.id)[1]?.status, "interrupted");
  assert.equal(
    recovered.messages(conversation.id)[1]?.content,
    "persisted partial",
  );
  recovered.close();
});

test("configuration fails closed without echoing secrets", () => {
  assert.throws(
    () => loadConfig({ AUTH_TOKEN: "secret" }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("AUTH_TOKEN") &&
      !error.message.includes("secret"),
  );
  assert.throws(() =>
    loadConfig({ AUTH_TOKEN: token, MODEL_PROVIDER: "ollama" }),
  );
  assert.throws(() => loadConfig({ AUTH_TOKEN: token, ALLOWED_ORIGINS: "*" }));
  assert.throws(() =>
    loadConfig({
      AUTH_TOKEN: token,
      ALLOWED_ORIGINS: "https://example.com/path",
    }),
  );
  assert.equal(loadConfig({ AUTH_TOKEN: token }).HOST, "127.0.0.1");
});

test("oversized HTTP bodies return a clear 413 without storing messages", async () => {
  const app = await fixture();
  const conversation = await app.conversation();
  const response = await app.request(
    `/api/conversations/${conversation.id}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x".repeat(100000) }),
    },
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: "Message body is too large.",
  });
  assert.equal(app.store.messages(conversation.id).length, 0);
});

test("oversized chunked uploads receive 413 before the upload finishes", async () => {
  const app = await fixture();
  const conversation = await app.conversation();
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(
      `${app.base}/api/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        agent: false,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          request.end();
          resolve(response.statusCode);
        });
      },
    );
    request.on("error", reject);
    request.write("x".repeat(70000));
  });
  assert.equal(status, 413);
  assert.equal(app.store.messages(conversation.id).length, 0);
});
