import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test, type TestContext } from "node:test";
import { setTimeout } from "node:timers/promises";
import { pickAnalysisSchema, picksSchema } from "@panky/shared";
import { AuthStore } from "../auth/store.js";
import { createApp } from "../http.js";
import { loadConfig } from "../config.js";
import { MockProvider } from "../providers/mock.js";
import type { ContextMessage, ModelProvider } from "../providers/provider.js";
import { PicksStore } from "./store.js";
import { sampleFixtures } from "./fixtures.js";

const origin = "http://localhost:5173";
const token = "picks-isolated-token-with-thirty-two-characters";
const analysis = "/api/picks/sample-premier-1/analysis";
async function fixture(
  t: TestContext,
  provider: ModelProvider = new MockProvider(0),
) {
  const directory = mkdtempSync(join(tmpdir(), "panky-picks-"));
  const path = join(directory, "test.sqlite");
  const app = createApp(
    loadConfig({
      AUTH_TOKEN: token,
      DATABASE_PATH: path,
      OWNER_EMAIL: "owner@gmail.com",
    }),
    provider,
  );
  const auth = new AuthStore(path, "owner@gmail.com");
  auth.issueSession(
    "owner",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    600000,
  );
  auth.updateAccess("friend@gmail.com", true);
  const friend = auth.acceptIdentity({
    email: "friend@gmail.com",
    sub: "friend",
    email_verified: true,
    nonce: "test",
  });
  auth.issueSession(
    friend.id,
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    600000,
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await app.close();
    auth.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (url: string, init: RequestInit = {}) =>
    fetch(base + url, {
      ...init,
      headers: {
        Origin: origin,
        Cookie:
          "panky-google-session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ...init.headers,
      },
    });
  const submit = (
    question = "Explain this prediction",
    init: RequestInit = {},
  ) =>
    request(analysis, {
      method: "POST",
      body: JSON.stringify({ question }),
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  const history = async () =>
    pickAnalysisSchema.parse(await (await request(analysis)).json());
  return { ...app, base, path, request, submit, history };
}

test("Picks endpoints enforce authentication, exact write origin and strict input", async (t) => {
  const app = await fixture(t);
  for (const [url, method] of [
    ["/api/picks", "GET"],
    [analysis, "GET"],
    [analysis, "POST"],
  ])
    assert.equal((await fetch(app.base + url, { method })).status, 401);
  assert.equal(
    (await app.submit("Explain", { headers: { Origin: "" } })).status,
    401,
  );
  assert.equal(
    (
      await app.submit("Explain", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  for (const body of [
    { question: " " },
    { question: "x".repeat(2001) },
    { question: "Explain", modelSelection: { provider: "chatgpt" } },
    { question: "Explain", fixture: {} },
  ])
    assert.equal(
      (await app.submit("", { body: JSON.stringify(body) })).status,
      400,
    );
  assert.equal((await app.request("/api/picks/missing/analysis")).status, 404);
  assert.deepEqual((await app.history()).messages, []);
  const fixtures = picksSchema.parse(
    await (await app.request("/api/picks")).json(),
  ).fixtures;
  assert.equal(fixtures.length, 4);
  for (const fixture of fixtures) {
    assert.equal(fixture.sample, true);
    assert.equal("odds" in fixture, false);
  }
});

test("Picks follow-ups use only match evidence and completed account history, with no chat records", async (t) => {
  const inputs: (readonly ContextMessage[])[] = [];
  const app = await fixture(t, {
    async *stream(history, tools, _signal, purpose) {
      inputs.push(history.map((item) => ({ ...item })));
      assert.equal(purpose, "picks");
      assert.deepEqual(tools, []);
      yield { type: "delta", text: "Sample explanation" };
      yield { type: "complete" };
    },
  });
  assert.equal((await app.submit()).status, 200);
  const first = await app.history();
  assert.equal(first.messages[1]?.content, "Sample explanation");
  assert.equal((await app.submit("What is uncertain?")).status, 200);
  assert(inputs[1]?.some((item) => item.content === "Sample explanation"));
  assert.match(JSON.stringify(inputs[0]), /SAMPLE|sample/);
  assert.match(JSON.stringify(inputs[0]), /Northbridge/);
  const friendHeaders = {
    Cookie: "panky-google-session=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };
  assert.deepEqual(
    await (await app.request(analysis, { headers: friendHeaders })).json(),
    { messages: [] },
  );
  await app.submit("Friend question", { headers: friendHeaders });
  assert(!JSON.stringify(inputs[2]).includes("What is uncertain?"));
  assert.equal((await app.history()).messages.length, 4);
  assert.deepEqual(app.store.conversations("owner"), []);
  const snapshot = new PicksStore(app.path);
  assert.equal(snapshot.messages("owner", "sample-premier-1").length, 4);
  snapshot.close();
});

test("Picks and chat share one execution slot in both directions", async (t) => {
  let started = () => {};
  let release = () => {};
  let entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = await fixture(t, {
    async *stream() {
      started();
      await gate;
      yield { type: "delta", text: "done" };
      yield { type: "complete" };
    },
  });
  const pending = app.submit();
  await entered;
  const health = (await (await app.request("/api/health")).json()) as {
    busy: boolean;
  };
  assert(health.busy);
  assert.equal((await app.history()).messages[1]?.status, "running");
  const conversation = app.store.createConversation();
  const sendChat = () =>
    app.request(`/api/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Hello" }),
    });
  assert.equal((await sendChat()).status, 409);
  assert.equal((await app.submit()).status, 409);
  release();
  await pending;
  entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chatResponse = await sendChat();
  await entered;
  assert.equal((await app.submit()).status, 409);
  release();
  await chatResponse.text();
  assert.equal((await app.history()).messages.length, 2);
});

test("disconnect persists partial Picks output and releases the global slot", async (t) => {
  let started = () => {};
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const app = await fixture(t, {
    async *stream(_history, _tools, signal) {
      yield { type: "delta", text: "partial" };
      started();
      await setTimeout(10000, undefined, { signal });
      yield { type: "complete" };
    },
  });
  const controller = new AbortController();
  const pending = app
    .submit("Explain", { signal: controller.signal })
    .catch(() => undefined);
  await entered;
  controller.abort();
  await pending;
  for (let attempt = 0; app.chat.busy && attempt < 100; attempt++)
    await setTimeout(10);
  assert.equal(app.chat.busy, false);
  const history = await app.history();
  assert.equal(history.messages[1]?.content, "partial");
  assert.equal(history.messages[1]?.status, "interrupted");
});

test("provider failures are saved without leaking errors or executing tools", async (t) => {
  const app = await fixture(t, {
    async *stream() {
      yield { type: "delta", text: "partial" };
      yield {
        type: "tool_call",
        name: "get_current_datetime",
        callId: "forbidden",
        arguments: {},
      };
    },
  });
  const history = pickAnalysisSchema.parse(await (await app.submit()).json());
  assert.equal(history.messages[1]?.status, "failed");
  assert.equal(history.messages[1]?.content, "partial");
  assert.equal(app.chat.busy, false);
});

test("Picks startup preserves unfinished work without replay", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "panky-picks-recovery-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "test.sqlite");
  const store = new PicksStore(path);
  const fixture = sampleFixtures[0];
  assert(fixture);
  const assistant = store.begin("owner", fixture, "Explain");
  assistant.content = "partial";
  store.save(assistant);
  store.close();
  const reopened = new PicksStore(path);
  assert.equal(
    reopened.messages("owner", fixture.id)[1]?.status,
    "interrupted",
  );
  assert.equal(reopened.messages("owner", fixture.id)[1]?.content, "partial");
  reopened.close();
});
