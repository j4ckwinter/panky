import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  conversationSchema,
  conversationsSchema,
  historySchema,
} from "@panky/shared";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";
import { MockProvider } from "./provider.js";
import { Store } from "./store.js";

const origin = "http://localhost:5173";
const token = "isolated-tests-only-at-least-32-characters";
const owner = "owner@gmail.com";
const member = "friend@gmail.com";

test("Google accounts isolate history, messages, tasks, cancellation, sessions and admin access", async () => {
  const app = createApp(
    loadConfig({
      AUTH_TOKEN: token,
      OWNER_EMAIL: owner,
      GOOGLE_CLIENT_ID: "123456789-test.apps.googleusercontent.com",
      DATABASE_PATH: ":memory:",
    }),
    new MockProvider(0),
    undefined,
    async (credential) => JSON.parse(credential),
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, cookie = "", data?: unknown) =>
    fetch(base + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  const login = async (email: string) => {
    const options = await request("/api/auth/google/options", "", {});
    assert.equal(options.status, 200);
    const { nonce } = (await options.json()) as { nonce: string };
    const challenge = options.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const result = await request("/api/auth/google/verify", challenge, {
      credential: JSON.stringify({
        sub: "sub-" + email,
        email,
        email_verified: true,
        nonce,
      }),
    });
    assert.equal(result.status, 200, await result.text());
    return result.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  };
  try {
    const a = await login(owner);
    assert.equal(
      (await request("/api/auth/access/invite", a, { email: member })).status,
      200,
    );
    const b = await login(member);
    const ca = conversationSchema.parse(
      await (await request("/api/conversations", a, {})).json(),
    );
    const cb = conversationSchema.parse(
      await (await request("/api/conversations", b, {})).json(),
    );
    const reply = await request(`/api/conversations/${ca.id}/messages`, a, {
      content: "Owner private message",
      includeActivity: true,
    });
    assert.equal(reply.status, 200);
    await reply.text();
    const saved = historySchema.parse(
      await (await request(`/api/conversations/${ca.id}`, a)).json(),
    );
    const run = saved.runs[0];
    assert(run);
    assert.deepEqual(
      conversationsSchema
        .parse(await (await request("/api/conversations", a)).json())
        .map((c) => c.id),
      [ca.id],
    );
    assert.deepEqual(
      conversationsSchema
        .parse(await (await request("/api/conversations", b)).json())
        .map((c) => c.id),
      [cb.id],
    );
    assert.equal((await request(`/api/conversations/${ca.id}`, b)).status, 404);
    assert.equal((await request(`/api/conversations/${cb.id}`, a)).status, 404);
    assert.equal(
      (
        await request(`/api/conversations/${ca.id}/messages`, b, {
          content: "intrusion",
        })
      ).status,
      404,
    );
    assert.equal(
      (await request(`/api/runs/${run.id}/cancel`, b, {})).status,
      404,
    );
    assert.equal(app.store.messages(ca.id).length, 2);
    assert.equal((await request("/api/auth/access", b)).status, 403);
    assert.equal(
      (
        await request("/api/auth/access/invite", b, {
          email: "another@gmail.com",
        })
      ).status,
      403,
    );
    const list = (await (await request("/api/auth/sessions", a)).json()) as {
      sessions: { id: string }[];
    };
    assert.equal(list.sessions.length, 1);
    const revoke = await request("/api/auth/sessions/revoke", b, {
      id: list.sessions[0]?.id,
    });
    assert.equal(revoke.status, 404);
    assert.equal((await request("/api/conversations", a)).status, 200);
    const legacy = await fetch(base + "/api/conversations", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.deepEqual(
      conversationsSchema.parse(await legacy.json()).map((c) => c.id),
      [ca.id],
    );
    const readingBody = new Promise<void>((resolve) => {
      app.server.once("request", (incoming) => {
        incoming.once("readable", () => resolve());
      });
    });
    const delayed = httpRequest(base + `/api/conversations/${cb.id}/messages`, {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: b,
        "Content-Type": "application/json",
      },
    });
    const deniedAfterRevoke = new Promise<number | undefined>(
      (resolve, reject) => {
        delayed.on("response", (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        });
        delayed.on("error", reject);
      },
    );
    delayed.write('{"content":"Delayed member request');
    await readingBody;
    assert.equal(
      (await request("/api/auth/access/revoke", a, { email: member })).status,
      200,
    );
    delayed.end('"}');
    assert.equal(await deniedAfterRevoke, 401);
    assert.equal(app.store.messages(cb.id).length, 0);
    assert.equal((await request("/api/conversations", b)).status, 401);
    assert.equal((await request("/api/conversations", a)).status, 200);
  } finally {
    await app.close();
  }
});

test("migration assigns legacy conversations only to the owner without changing messages", () => {
  const directory = mkdtempSync(join(tmpdir(), "panky-ownership-"));
  const path = join(directory, "test.sqlite");
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
      INSERT INTO conversations VALUES('10000000-0000-4000-8000-000000000001','Existing chat','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');`);
    db.close();
    const store = new Store(path);
    assert.equal(store.conversations("owner").length, 1);
    assert.equal(store.conversations("friend").length, 0);
    const fresh = store.createConversation("friend");
    assert.equal(store.ownsConversation(fresh.id, "friend"), true);
    assert.equal(store.ownsConversation(fresh.id, "owner"), false);
    store.close();
    const reopened = new Store(path);
    assert.equal(reopened.conversations("owner").length, 1);
    assert.equal(reopened.conversations("friend").length, 1);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
