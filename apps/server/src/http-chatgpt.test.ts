import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AuthStore } from "./auth/store.js";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";
import type { ContextMessage, ModelProvider } from "./providers/provider.js";

const token = "isolated-chatgpt-owner-test-token-long-enough";
const origin = "http://localhost:5173";
test("subscription routing is opt-in, owner-only and has no tools or automatic local fallback", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "panky-chatgpt-http-"));
  const path = join(directory, "test.sqlite");
  let requests = 0;
  let localRequests = 0;
  let disconnected = false;
  const histories: (readonly ContextMessage[])[] = [];
  const local: ModelProvider = {
    async *stream() {
      localRequests++;
      yield { type: "delta", text: "local" };
      yield { type: "complete" };
    },
  };
  const service = {
    async status() {
      return disconnected
        ? { kind: "disconnected" as const }
        : { kind: "connected" as const, email: "owner@example.com" };
    },
    async models() {
      return disconnected ? [] : [{ id: "test-model", name: "Test model" }];
    },
    async disconnect() {
      disconnected = true;
    },
    provider(model: string): ModelProvider {
      assert.equal(model, "test-model");
      return {
        async *stream(history, tools) {
          requests++;
          assert.equal(tools.length, 0);
          histories.push([...history]);
          yield { type: "delta", text: "subscription answer" };
          yield { type: "complete" };
        },
      };
    },
  };
  const config = loadConfig({
    AUTH_TOKEN: token,
    DATABASE_PATH: path,
    OWNER_EMAIL: "owner@example.com",
    CHATGPT_ENABLED: "true",
  });
  const app = createApp(
    config,
    local,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    service,
  );
  const auth = new AuthStore(path, config.OWNER_EMAIL);
  auth.issueSession(
    "owner",
    "ooooooooooooooooooooooooooooooooooooooooooo",
    600000,
  );
  auth.updateAccess("member@gmail.com", true);
  const member = auth.acceptIdentity({
    sub: "member",
    email: "member@gmail.com",
    email_verified: true,
    nonce: "nonce",
  });
  auth.issueSession(
    member.id,
    "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
    600000,
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  t.after(async () => {
    await app.close();
    auth.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "ooooooooooooooooooooooooooooooooooooooooooo",
    exactOrigin = origin,
  ) =>
    fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: {
        Cookie: `panky-google-session=${cookie}`,
        Origin: exactOrigin,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal(
    (await request("/connections/chatgpt", "GET", undefined, "")).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/connections/chatgpt",
        "GET",
        undefined,
        "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/connections/chatgpt/models",
        "GET",
        undefined,
        "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/connections/chatgpt",
        "DELETE",
        undefined,
        "ooooooooooooooooooooooooooooooooooooooooooo",
        "https://other.example",
      )
    ).status,
    403,
  );
  const conversation = (await (
    await request("/conversations", "POST", {})
  ).json()) as { id: string };
  const payload = {
    content: "Explain queues",
    modelSelection: { provider: "chatgpt", model: "test-model" },
  };
  const result = await request(
    `/conversations/${conversation.id}/messages`,
    "POST",
    payload,
  );
  assert.equal(result.status, 200);
  assert.match(await result.text(), /subscription answer/);
  assert.equal(requests, 1);
  assert.equal(localRequests, 0);
  assert.equal(histories[0]?.at(-1)?.content, "Explain queues");
  const memberChat = (await (
    await request(
      "/conversations",
      "POST",
      {},
      "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
    )
  ).json()) as { id: string };
  assert.equal(
    (
      await request(
        `/conversations/${memberChat.id}/messages`,
        "POST",
        payload,
        "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/conversations/${conversation.id}/messages`, "POST", {
        ...payload,
        modelSelection: { provider: "chatgpt", model: "unknown" },
      })
    ).status,
    400,
  );
  assert.equal((await request("/connections/chatgpt", "DELETE")).status, 204);
  assert.equal(
    (
      await request(
        `/conversations/${conversation.id}/messages`,
        "POST",
        payload,
      )
    ).status,
    400,
  );
  assert.equal(requests, 1);
  assert.equal(localRequests, 0);
  const localReply = await request(
    `/conversations/${conversation.id}/messages`,
    "POST",
    { content: "Local question" },
  );
  await localReply.text();
  assert.equal(localRequests, 1);
  config.CHATGPT_ENABLED = false;
  assert.deepEqual(await (await request("/connections/chatgpt")).json(), {
    kind: "unavailable",
  });
  assert.equal(
    (
      await request(
        `/conversations/${conversation.id}/messages`,
        "POST",
        payload,
      )
    ).status,
    409,
  );
});
