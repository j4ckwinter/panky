import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import { deviceSessionsSchema } from "@panky/shared";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";

const token = "isolated-auth-test-token-long-enough-for-validation";
const origin = "http://localhost:5173";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture(authOrigin = origin) {
  const dir = mkdtempSync(join(tmpdir(), "panky-auth-"));
  const path = join(dir, "test.sqlite");
  const config = loadConfig({
    AUTH_TOKEN: token,
    DATABASE_PATH: path,
    AUTH_ORIGIN: authOrigin,
    ALLOWED_ORIGINS: `${origin},http://127.0.0.1:5173,https://panky.example`,
  });
  let app = createApp(config);
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
    value: unknown = {},
    headers: Record<string, string> = {},
  ) =>
    request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(value),
    });
  const session = (expiresAt = Date.now() + 60000) => {
    const secret = randomBytes(32).toString("base64url");
    const id = randomUUID();
    db.prepare("INSERT INTO auth_sessions VALUES (?, ?, ?, ?)").run(
      id,
      createHash("sha256").update(secret).digest("hex"),
      Date.now(),
      expiresAt,
    );
    return { id, cookie: `panky-session=${secret}`, secret };
  };
  const restart = async () => {
    await app.close();
    app = createApp(config);
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    assert(address && typeof address !== "string");
    port = address.port;
  };
  return { request, post, session, db, restart };
}

test("auth status is public but data endpoints reject unauthenticated access", async () => {
  const app = await fixture();
  assert.deepEqual(await (await app.request("/auth/status")).json(), {
    authenticated: false,
    configured: false,
  });
  assert.equal((await app.request("/conversations")).status, 401);
  assert.equal((await app.post("/conversations")).status, 401);
  assert.equal((await app.request("/auth/sessions")).status, 401);
});

test("session cookies authenticate data independently of bearer headers and enforce origin on writes", async () => {
  const app = await fixture();
  const session = app.session();
  assert.equal(
    (await app.request("/health", { headers: { Cookie: session.cookie } }))
      .status,
    200,
  );
  assert.equal(
    (await app.post("/conversations", {}, { Cookie: session.cookie })).status,
    201,
  );
  assert.equal(
    (
      await app.post(
        "/conversations",
        {},
        { Cookie: session.cookie, Origin: "" },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await app.post(
        "/conversations",
        {},
        { Cookie: session.cookie, Origin: "http://127.0.0.1:5173" },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await app.request("/health", {
        headers: { Cookie: session.cookie, "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await app.request("/health", {
        headers: { Cookie: `${session.cookie}; ${session.cookie}` },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await app.request("/health", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    200,
  );
});

test("sessions expire and device revocation invalidates only the selected session", async () => {
  const app = await fixture();
  const current = app.session();
  const other = app.session();
  const expired = app.session(Date.now() - 1);
  assert.equal(
    (await app.request("/health", { headers: { Cookie: expired.cookie } }))
      .status,
    401,
  );
  const list = deviceSessionsSchema.parse(
    await (
      await app.request("/auth/sessions", {
        headers: { Cookie: current.cookie },
      })
    ).json(),
  );
  assert.equal(list.sessions.length, 2);
  assert.equal(list.sessions.find((s) => s.id === current.id)?.current, true);
  assert.equal(JSON.stringify(list).includes(current.secret), false);
  assert.equal(
    (
      await app.post(
        "/auth/sessions/revoke",
        { id: other.id },
        { Cookie: current.cookie },
      )
    ).status,
    200,
  );
  assert.equal(
    (await app.request("/health", { headers: { Cookie: other.cookie } }))
      .status,
    401,
  );
  assert.equal(
    (await app.request("/health", { headers: { Cookie: current.cookie } }))
      .status,
    200,
  );
  const logout = await app.post("/auth/logout", {}, { Cookie: current.cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(
    (await app.request("/health", { headers: { Cookie: current.cookie } }))
      .status,
    401,
  );
});

test("owner enrollment requires token and exact origin, produces secure browser-bound challenge", async () => {
  const app = await fixture("https://panky.example");
  assert.equal(
    (await app.post("/auth/register/options", { token }, { Origin: origin }))
      .status,
    403,
  );
  assert.equal(
    (await app.post("/auth/register/options", { token }, { Origin: "" }))
      .status,
    403,
  );
  assert.equal(
    (await app.post("/auth/register/options", { token: "incorrect" })).status,
    401,
  );
  const registration = await app.post("/auth/register/options", { token });
  assert.equal(registration.status, 200);
  const options = z
    .object({
      rp: z.object({ id: z.string() }),
      authenticatorSelection: z.object({
        userVerification: z.string(),
        residentKey: z.string(),
      }),
    })
    .parse(await registration.json());
  assert.equal(options.rp.id, "panky.example");
  assert.equal(options.authenticatorSelection.userVerification, "required");
  assert.equal(options.authenticatorSelection.residentKey, "required");
  const cookie = registration.headers.get("set-cookie") ?? "";
  assert.match(cookie, /__Host-panky-challenge=/);
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=300; Secure/);
  assert.equal((await app.post("/auth/register/verify", {})).status, 401);
  assert.equal(
    (
      await app.post(
        "/auth/register/verify",
        {},
        { Cookie: cookie.split(";")[0] ?? "" },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await app.post(
        "/auth/register/verify",
        {},
        { Cookie: cookie.split(";")[0] ?? "" },
      )
    ).status,
    401,
  );
});

test("recovery invalidates sessions, credentials and pending challenges", async () => {
  const app = await fixture();
  const registration = await app.post("/auth/register/options", { token });
  const challengeCookie =
    registration.headers.get("set-cookie")?.split(";")[0] ?? "";
  app.db
    .prepare("INSERT INTO auth_credentials VALUES (?, ?, ?)")
    .run("existing-credential", "public-key", 0);
  const session = app.session();
  assert.equal(
    (await app.post("/auth/register/options", { token })).status,
    409,
  );
  assert.equal(
    (await app.post("/auth/recover", { token: "wrong" })).status,
    401,
  );
  assert.equal(
    (await app.request("/health", { headers: { Cookie: session.cookie } }))
      .status,
    200,
  );
  assert.equal((await app.post("/auth/recover", { token })).status, 200);
  assert.equal(
    (await app.request("/health", { headers: { Cookie: session.cookie } }))
      .status,
    401,
  );
  assert.deepEqual(await (await app.request("/auth/status")).json(), {
    authenticated: false,
    configured: false,
  });
  assert.equal(
    (await app.post("/auth/register/verify", {}, { Cookie: challengeCookie }))
      .status,
    401,
  );
});

test("wrong recovery tokens are rate limited without trusting forwarded client addresses", async () => {
  const app = await fixture();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await app.post(
          "/auth/recover",
          { token: "wrong" },
          { "X-Forwarded-For": `10.0.0.${i}` },
        )
      ).status,
      401,
    );
  assert.equal((await app.post("/auth/recover", { token })).status, 429);
});

test("cross-site auth reads and malformed auth inputs fail closed", async () => {
  const app = await fixture();
  const session = app.session();
  assert.equal(
    (
      await app.request("/auth/status", {
        headers: { "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.request("/auth/sessions", {
        headers: { Cookie: session.cookie, Origin: "http://127.0.0.1:5173" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await app.post(
        "/auth/sessions/revoke",
        { id: "bad" },
        { Cookie: session.cookie },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await app.request("/auth/register/options", {
        method: "POST",
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(
    (await app.post("/auth/register/options", { token: "x".repeat(70000) }))
      .status,
    413,
  );
});

test("AUTH_ORIGIN rejects insecure remote and malformed origins", () => {
  for (const value of [
    "http://panky.example",
    "http://127.0.0.1:5173",
    "https://127.0.0.1",
    "https://[::1]",
    "http://[::1]:5173",
    "https://panky.example/path",
    "https://user:pass@panky.example",
    "https://panky.example/",
  ])
    assert.throws(
      () => loadConfig({ AUTH_TOKEN: token, AUTH_ORIGIN: value }),
      /AUTH_ORIGIN/,
    );
});

test("persisted credentials and sessions survive backend restart while challenges do not", async () => {
  const app = await fixture();
  const registration = await app.post("/auth/register/options", { token });
  const challengeCookie =
    registration.headers.get("set-cookie")?.split(";")[0] ?? "";
  app.db
    .prepare("INSERT INTO auth_credentials VALUES (?, ?, ?)")
    .run("existing-credential", "public-key", 0);
  const session = app.session();
  await app.restart();
  assert.deepEqual(
    await (
      await app.request("/auth/status", { headers: { Cookie: session.cookie } })
    ).json(),
    { authenticated: true, configured: true },
  );
  assert.equal(
    (await app.post("/auth/register/verify", {}, { Cookie: challengeCookie }))
      .status,
    401,
  );
});
