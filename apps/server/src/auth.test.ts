import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { type GoogleVerifier, googleIdentitySchema } from "./google.js";
import { createApp } from "./http.js";

const token = "isolated-auth-test-token-long-enough-for-validation";
const origin = "http://localhost:5173";
const owner = "owner@gmail.com";
const clientId = "123456789-isolated.apps.googleusercontent.com";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
const decode: GoogleVerifier = async (credential) =>
  googleIdentitySchema.parse(JSON.parse(credential));

async function fixture(
  options: {
    origin?: string;
    verifier?: GoogleVerifier;
    configured?: boolean;
  } = {},
) {
  const authOrigin = options.origin ?? origin;
  const dir = mkdtempSync(join(tmpdir(), "panky-google-auth-"));
  const path = join(dir, "test.sqlite");
  const config = loadConfig({
    AUTH_TOKEN: token,
    DATABASE_PATH: path,
    AUTH_ORIGIN: authOrigin,
    ALLOWED_ORIGINS: `${origin},http://127.0.0.1:5173,https://panky.example`,
    OWNER_EMAIL: owner,
    ...(options.configured === false ? {} : { GOOGLE_CLIENT_ID: clientId }),
  });
  let app = createApp(config, undefined, undefined, options.verifier ?? decode);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert(address && typeof address !== "string");
  let port = address.port;
  const db = new DatabaseSync(path);
  cleanups.push(async () => {
    db.close();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const request = (endpoint: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}/api${endpoint}`, {
      ...init,
      headers: { Origin: authOrigin, ...init.headers },
    });
  const post = (
    endpoint: string,
    data: unknown = {},
    headers: Record<string, string> = {},
  ) =>
    request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  const start = async () => {
    const response = await post("/auth/google/options");
    assert.equal(response.status, 200);
    const options = z
      .object({ nonce: z.string(), clientId: z.string() })
      .parse(await response.json());
    return {
      nonce: options.nonce,
      cookie: response.headers.getSetCookie()[0]?.split(";")[0] ?? "",
    };
  };
  const login = async (email = owner, subject = `subject-${email}`) => {
    const challenge = await start();
    const response = await post(
      "/auth/google/verify",
      {
        credential: JSON.stringify({
          sub: subject,
          email,
          email_verified: true,
          nonce: challenge.nonce,
        }),
      },
      { Cookie: challenge.cookie },
    );
    const cookie =
      response.headers
        .getSetCookie()
        .find((item) => item.includes("google-session="))
        ?.split(";")[0] ?? "";
    return { response, cookie };
  };
  const restart = async () => {
    await app.close();
    app = createApp(config, undefined, undefined, options.verifier ?? decode);
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    assert(address && typeof address !== "string");
    port = address.port;
  };
  return { request, post, start, login, db, restart };
}

test("Google setup fails closed without configuration and legacy passkey routes are unavailable", async () => {
  const app = await fixture({ configured: false });
  assert.deepEqual(await (await app.request("/auth/status")).json(), {
    authenticated: false,
    configured: false,
    user: null,
    googleClientId: null,
  });
  assert.equal((await app.post("/auth/google/options")).status, 503);
  assert.equal((await app.post("/auth/recover", { token })).status, 401);
  assert.equal((await app.request("/conversations")).status, 401);
});

test("owner signs in with verified Google identity; nonce and session cookies are bound and single-use", async () => {
  const app = await fixture({ origin: "https://panky.example" });
  const challenge = await app.start();
  assert.match(challenge.cookie, /^__Host-panky-google-challenge=/);
  const credential = JSON.stringify({
    sub: "owner-sub",
    email: owner,
    email_verified: true,
    nonce: challenge.nonce,
  });
  const missing = await app.post("/auth/google/verify", { credential });
  assert.equal(missing.status, 401);
  const response = await app.post(
    "/auth/google/verify",
    { credential },
    { Cookie: challenge.cookie },
  );
  assert.equal(response.status, 200);
  const sessionHeader =
    response.headers
      .getSetCookie()
      .find((item) => item.includes("google-session=")) ?? "";
  assert.match(
    sessionHeader,
    /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/,
  );
  assert.equal(
    (
      await app.post(
        "/auth/google/verify",
        { credential },
        { Cookie: challenge.cookie },
      )
    ).status,
    401,
  );
  const cookie = sessionHeader.split(";")[0] ?? "";
  assert.deepEqual(
    await (
      await app.request("/auth/status", { headers: { Cookie: cookie } })
    ).json(),
    {
      authenticated: true,
      configured: true,
      googleClientId: clientId,
      user: { id: "owner", email: owner, role: "owner" },
    },
  );
  assert.equal(
    (await app.post("/conversations", {}, { Cookie: cookie, Origin: "" }))
      .status,
    401,
  );
  assert.equal(
    (await app.post("/conversations", {}, { Cookie: cookie, Origin: origin }))
      .status,
    401,
  );
  assert.equal(
    (
      await app.request("/health", {
        headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await app.request("/health", {
        headers: { Cookie: `${cookie}; ${cookie}` },
      })
    ).status,
    401,
  );
});

test("only invited Gmail or Workspace identities can join and subject/email bindings cannot change", async () => {
  const app = await fixture();
  assert.equal((await app.login("friend@gmail.com")).response.status, 403);
  const ownerLogin = await app.login();
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(
    (
      await app.post(
        "/auth/access/invite",
        { email: "friend@gmail.com" },
        { Cookie: ownerLogin.cookie },
      )
    ).status,
    200,
  );
  const friend = await app.login("friend@gmail.com");
  assert.equal(friend.response.status, 200);
  assert.equal(
    (await app.login("friend@gmail.com", "different-subject")).response.status,
    403,
  );
  assert.equal(
    (await app.login("other@gmail.com", "subject-friend@gmail.com")).response
      .status,
    403,
  );
  assert.equal(
    (
      await app.post(
        "/auth/access/invite",
        { email: "other@gmail.com" },
        { Cookie: friend.cookie },
      )
    ).status,
    403,
  );
  assert.equal(
    (await app.request("/auth/access", { headers: { Cookie: friend.cookie } }))
      .status,
    403,
  );
  assert.equal(
    (
      await app.post(
        "/auth/access/revoke",
        { email: owner },
        { Cookie: ownerLogin.cookie },
      )
    ).status,
    400,
  );
  await app.post(
    "/auth/access/invite",
    { email: "person@example.com" },
    { Cookie: ownerLogin.cookie },
  );
  assert.equal((await app.login("person@example.com")).response.status, 403);
  const challenge = await app.start();
  const hosted = await app.post(
    "/auth/google/verify",
    {
      credential: JSON.stringify({
        sub: "hosted-sub",
        email: "person@example.com",
        email_verified: true,
        hd: "example.com",
        nonce: challenge.nonce,
      }),
    },
    { Cookie: challenge.cookie },
  );
  assert.equal(hosted.status, 200);
});

test("session listing and revocation are private to each account, logout expires the current session", async () => {
  const app = await fixture();
  const first = await app.login();
  const second = await app.login();
  await app.post(
    "/auth/access/invite",
    { email: "friend@gmail.com" },
    { Cookie: first.cookie },
  );
  const friend = await app.login("friend@gmail.com");
  const parse = z.object({
    sessions: z.array(z.object({ id: z.string(), current: z.boolean() })),
  });
  const ownerList = parse.parse(
    await (
      await app.request("/auth/sessions", { headers: { Cookie: first.cookie } })
    ).json(),
  );
  const friendList = parse.parse(
    await (
      await app.request("/auth/sessions", {
        headers: { Cookie: friend.cookie },
      })
    ).json(),
  );
  assert.equal(ownerList.sessions.length, 2);
  assert.equal(friendList.sessions.length, 1);
  assert.equal(
    (
      await app.post(
        "/auth/sessions/revoke",
        { id: friendList.sessions[0]?.id },
        { Cookie: first.cookie },
      )
    ).status,
    404,
  );
  const other = ownerList.sessions.find((item) => !item.current);
  assert(other);
  assert.equal(
    (
      await app.post(
        "/auth/sessions/revoke",
        { id: other.id },
        { Cookie: first.cookie },
      )
    ).status,
    200,
  );
  assert.equal(
    (await app.request("/health", { headers: { Cookie: second.cookie } }))
      .status,
    401,
  );
  assert.equal(
    (await app.request("/health", { headers: { Cookie: friend.cookie } }))
      .status,
    200,
  );
  const logout = await app.post("/auth/logout", {}, { Cookie: first.cookie });
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(
    (await app.request("/health", { headers: { Cookie: first.cookie } }))
      .status,
    401,
  );
});

test("revoking access invalidates member sessions and pending sign-ins; reinviting preserves subject binding", async () => {
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  let block = false;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const app = await fixture({
    verifier: async (credential) => {
      if (block) {
        started?.();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return decode(credential, clientId);
    },
  });
  const ownerSession = await app.login();
  await app.post(
    "/auth/access/invite",
    { email: "friend@gmail.com" },
    { Cookie: ownerSession.cookie },
  );
  const friend = await app.login("friend@gmail.com");
  block = true;
  const pending = app.login("friend@gmail.com");
  await startedPromise;
  assert.equal(
    (
      await app.post(
        "/auth/access/revoke",
        { email: "friend@gmail.com" },
        { Cookie: ownerSession.cookie },
      )
    ).status,
    200,
  );
  release?.();
  assert.equal((await pending).response.status, 401);
  block = false;
  assert.equal(
    (await app.request("/health", { headers: { Cookie: friend.cookie } }))
      .status,
    401,
  );
  assert.equal((await app.login("friend@gmail.com")).response.status, 403);
  await app.post(
    "/auth/access/invite",
    { email: "friend@gmail.com" },
    { Cookie: ownerSession.cookie },
  );
  assert.equal(
    (await app.login("friend@gmail.com", "different")).response.status,
    403,
  );
  assert.equal((await app.login("friend@gmail.com")).response.status, 200);
});

test("invalid nonce and unverified identity fail closed; authentication attempts are bounded", async () => {
  const app = await fixture();
  for (const invalid of [{ nonce: "incorrect" }, { email_verified: false }]) {
    const challenge = await app.start();
    assert.equal(
      (
        await app.post(
          "/auth/google/verify",
          {
            credential: JSON.stringify({
              sub: "owner-sub",
              email: owner,
              email_verified: true,
              nonce: challenge.nonce,
              ...invalid,
            }),
          },
          { Cookie: challenge.cookie },
        )
      ).status,
      401,
    );
  }
  assert.equal(
    (await app.post("/auth/google/options", {}, { Origin: "" })).status,
    403,
  );
  assert.equal(
    (
      await app.post(
        "/auth/google/options",
        {},
        { "Sec-Fetch-Site": "cross-site" },
      )
    ).status,
    403,
  );
  for (let index = 0; index < 56; index++)
    assert.equal((await app.post("/auth/google/options")).status, 200);
  assert.equal(
    (
      await app.post(
        "/auth/google/options",
        {},
        { "X-Forwarded-For": "8.8.8.8" },
      )
    ).status,
    429,
  );
});

test("Google sessions persist and expire, legacy passkey sessions never authenticate", async () => {
  const app = await fixture();
  const ownerSession = await app.login();
  const challenge = await app.start();
  app.db.exec(
    "CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, tokenHash TEXT, createdAt INTEGER, expiresAt INTEGER)",
  );
  const legacy = randomBytes(32).toString("base64url");
  app.db
    .prepare("INSERT INTO auth_sessions VALUES (?, ?, ?, ?)")
    .run(
      randomUUID(),
      createHash("sha256").update(legacy).digest("hex"),
      Date.now(),
      Date.now() + 60000,
    );
  assert.equal(
    (
      await app.request("/health", {
        headers: { Cookie: `panky-session=${legacy}` },
      })
    ).status,
    401,
  );
  await app.restart();
  assert.equal(
    (await app.request("/health", { headers: { Cookie: ownerSession.cookie } }))
      .status,
    200,
  );
  assert.equal(
    (
      await app.post(
        "/auth/google/verify",
        { credential: "{}" },
        { Cookie: challenge.cookie },
      )
    ).status,
    401,
  );
  app.db.prepare("UPDATE google_sessions SET expiresAt=?").run(Date.now() - 1);
  assert.equal(
    (await app.request("/health", { headers: { Cookie: ownerSession.cookie } }))
      .status,
    401,
  );
});

test("Google configuration requires owner email, exact origin and a valid client identifier", () => {
  assert.throws(
    () => loadConfig({ AUTH_TOKEN: token, GOOGLE_CLIENT_ID: clientId }),
    /OWNER_EMAIL/,
  );
  for (const value of [
    "bad",
    "https://example.com",
    "client.apps.googleusercontent.com/path",
  ])
    assert.throws(
      () =>
        loadConfig({
          AUTH_TOKEN: token,
          GOOGLE_CLIENT_ID: value,
          OWNER_EMAIL: owner,
        }),
      /GOOGLE_CLIENT_ID/,
    );
  for (const value of [
    "http://panky.example",
    "http://127.0.0.1:5173",
    "https://[::1]",
    "https://panky.example/path",
    "https://user:pass@panky.example",
  ])
    assert.throws(
      () => loadConfig({ AUTH_TOKEN: token, AUTH_ORIGIN: value }),
      /AUTH_ORIGIN/,
    );
});
