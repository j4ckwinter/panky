import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import {
  notionAuthorizationSchema,
  notionConnectionSchema,
} from "@panky/shared";
import { AuthStore } from "../auth/store.js";
import { loadConfig } from "../config.js";
import { createApp } from "../http.js";
import type { NotionOAuth, NotionTokens } from "./notion.js";
import type { importNotionPage } from "../experience/notion.js";
import type { searchNotionPages } from "./pages.js";

export const origin = "http://localhost:5173";
export const bearer = "isolated-notion-test-token-long-enough-for-validation";
export const tokens: NotionTokens = {
  access_token: "private-access-token",
  refresh_token: "private-refresh-token",
  token_type: "bearer",
  workspace_id: "9186a573-2220-4fbe-8c4c-86b9fb3ed762",
  workspace_name: "My workspace",
  bot_id: "34214623-9887-413e-bff5-9d81459515d1",
};
export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function fixture(
  t: TestContext,
  provider: Partial<NotionOAuth> = {},
  configured = true,
  content: {
    importer?: typeof importNotionPage;
    searcher?: typeof searchNotionPages;
    legacyToken?: string;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "panky-notion-oauth-"));
  const path = join(dir, "test.sqlite");
  const config = loadConfig({
    AUTH_TOKEN: bearer,
    AUTH_ORIGIN: origin,
    DATABASE_PATH: path,
    OWNER_EMAIL: "owner@gmail.com",
    NOTION_TOKEN: content.legacyToken,
    GOOGLE_CLIENT_ID: "123-test.apps.googleusercontent.com",
    ...(configured
      ? {
          NOTION_CLIENT_ID: randomUUID(),
          NOTION_CLIENT_SECRET: "isolated-secret",
          NOTION_TOKEN_KEY: "a".repeat(64),
        }
      : {}),
  });
  const client: NotionOAuth = {
    exchange: async () => tokens,
    refresh: async () => ({
      ...tokens,
      access_token: "rotated-access",
      refresh_token: "rotated-refresh",
    }),
    check: async () => {},
    ...provider,
  };
  let app = createApp(
    config,
    undefined,
    undefined,
    undefined,
    content.importer,
    client,
    content.searcher,
  );
  const auth = new AuthStore(path, config.OWNER_EMAIL);
  const db = new DatabaseSync(path);
  const login = (userId: string) => {
    const secret = randomBytes(32).toString("base64url");
    auth.issueSession(userId, secret, 600000);
    const session = auth.session(secret);
    assert(session);
    return {
      cookie: `panky-google-session=${secret}`,
      sessionId: session.id,
      userId,
    };
  };
  const owner = login("owner");
  auth.updateAccess("friend@gmail.com", true);
  const friendUser = auth.acceptIdentity({
    email: "friend@gmail.com",
    sub: "friend-subject",
    email_verified: true,
    nonce: "fixture",
  });
  const friend = login(friendUser.id);
  let base = "";
  const listen = async () => {
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    assert(address && typeof address !== "string");
    base = `http://127.0.0.1:${address.port}`;
  };
  await listen();
  t.after(async () => {
    db.close();
    auth.close();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const request = (suffix = "", init: RequestInit = {}, account = owner) =>
    fetch(`${base}/api/connections/notion${suffix}`, {
      ...init,
      redirect: "manual",
      headers: { Origin: origin, Cookie: account.cookie, ...init.headers },
    });
  const post = (suffix: string, body: unknown = {}, account = owner) =>
    request(
      suffix,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      account,
    );
  const start = async (account = owner) => {
    const response = await post("/authorize", {}, account);
    assert.equal(response.status, 200);
    const url = new URL(
      notionAuthorizationSchema.parse(await response.json()).url,
    );
    const state = url.searchParams.get("state");
    assert(state);
    return { state, url };
  };
  const status = async (account = owner) =>
    notionConnectionSchema.parse(await (await request("", {}, account)).json());
  const complete = (state: string, account = owner) =>
    post("/complete", { state, code: "private-code" }, account);
  const connect = async (account = owner) => {
    const { state } = await start(account);
    assert.deepEqual(await (await complete(state, account)).json(), {
      result: "connected",
    });
  };
  return {
    request,
    raw: (path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: { Origin: origin, Cookie: owner.cookie, ...init.headers },
      }),
    experience: () => app.experience,
    post,
    start,
    complete,
    connect,
    status,
    owner,
    friend,
    auth,
    db,
    login,
    restart: async () => {
      await app.close();
      app = createApp(
        config,
        undefined,
        undefined,
        undefined,
        content.importer,
        client,
        content.searcher,
      );
      await listen();
    },
  };
}
