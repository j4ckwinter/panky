import assert from "node:assert/strict";
import { test } from "node:test";
import { bearer, deferred, fixture, origin, tokens } from "./test-support.js";

test("connection setup fails closed and requires browser sessions and exact write origins", async (t) => {
  const app = await fixture(t, {}, false);
  assert.deepEqual(await app.status(), { kind: "unavailable" });
  assert.equal((await app.post("/authorize")).status, 503);
  assert.equal(
    (
      await app.request("", {
        headers: { Cookie: "", Authorization: `Bearer ${bearer}` },
      })
    ).status,
    401,
  );
  assert.equal(
    (await app.request("", { method: "DELETE", headers: { Origin: "" } }))
      .status,
    401,
  );
  assert.equal(
    (
      await app.request("", {
        method: "DELETE",
        headers: { Origin: "https://attacker.example" },
      })
    ).status,
    403,
  );
  assert.equal((await app.request("?userId=owner")).status, 400);
});

test("each account connects independently, tokens are encrypted and connections survive restart", async (t) => {
  const app = await fixture(t);
  await app.connect();
  assert.deepEqual(await app.status(app.friend), { kind: "disconnected" });
  await app.connect(app.friend);
  const before = await app.status();
  assert.equal(before.kind, "connected");
  const rows = app.db.prepare("SELECT * FROM notion_connections").all();
  assert.equal(rows.length, 2);
  assert(!JSON.stringify(rows).includes(tokens.access_token));
  assert(!JSON.stringify(rows).includes(tokens.refresh_token ?? ""));
  assert.notEqual(rows[0]?.encryptedTokens, rows[1]?.encryptedTokens);
  await app.restart();
  assert.deepEqual(await app.status(), before);
  assert.equal((await app.post("/authorize")).status, 409);
  assert.equal(
    (await app.request("", { method: "DELETE" }, app.friend)).status,
    204,
  );
  assert.deepEqual(await app.status(app.friend), { kind: "disconnected" });
  assert.deepEqual(await app.status(), before);
});

test("OAuth state is single-use and bound to both account and initiating session", async (t) => {
  const app = await fixture(t);
  const { state, url } = await app.start();
  assert.equal(
    url.searchParams.get("redirect_uri"),
    `${origin}/api/connections/notion/callback`,
  );
  assert.equal((await app.complete(state, app.friend)).status, 400);
  assert.equal((await app.complete(state, app.login("owner"))).status, 400);
  assert.deepEqual(await (await app.complete(state)).json(), {
    result: "connected",
  });
  assert.equal((await app.complete(state)).status, 400);
});

test("denial consumes state and newer authorization invalidates older attempts", async (t) => {
  const app = await fixture(t);
  const old = await app.start();
  const current = await app.start();
  assert.equal((await app.complete(old.state)).status, 400);
  assert.deepEqual(
    await (
      await app.post("/complete", {
        state: current.state,
        error: "access_denied",
      })
    ).json(),
    { result: "denied" },
  );
  assert.equal((await app.complete(current.state)).status, 400);
  assert.deepEqual(await app.status(), { kind: "disconnected" });
});

test("expired authorization cannot create a connection", async (t) => {
  const app = await fixture(t);
  const { state } = await app.start();
  const now = Date.now();
  t.mock.timers.enable({ apis: ["Date"] });
  t.mock.timers.setTime(now + 300001);
  assert.equal((await app.complete(state)).status, 400);
});

test("callback landing accepts external navigation without weakening authentication", async (t) => {
  const app = await fixture(t);
  const response = await app.request(
    "/callback?code=secret-code&state=opaque-state",
    { headers: { Origin: "", Cookie: "", "Sec-Fetch-Site": "cross-site" } },
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /default-src 'none'.*frame-ancestors 'none'/,
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const html = await response.text();
  assert(!html.includes("secret-code"));
  assert.match(html, /history.replaceState/);
  assert.match(html, /credentials: 'same-origin'/);
  assert.equal((await app.request("/callback?code=a&code=b")).status, 400);
  assert.equal((await app.request("/callback?evil=a")).status, 400);
  assert.equal(
    (
      await app.request("/complete", {
        method: "POST",
        headers: { "Sec-Fetch-Site": "cross-site" },
        body: "{}",
      })
    ).status,
    401,
  );
});

test("disconnect cancels in-flight authorization and late results cannot restore it", async (t) => {
  const entered = deferred<void>();
  const result = deferred<typeof tokens>();
  const app = await fixture(t, {
    exchange: async () => {
      entered.resolve();
      return result.promise;
    },
  });
  const { state } = await app.start();
  const pending = app.complete(state);
  await entered.promise;
  assert.equal((await app.request("", { method: "DELETE" })).status, 204);
  result.resolve(tokens);
  assert.deepEqual(await (await pending).json(), { result: "error" });
  assert.deepEqual(await app.status(), { kind: "disconnected" });
  await app.restart();
  assert.deepEqual(await app.status(), { kind: "disconnected" });
});

test("session revocation during token exchange prevents persistence", async (t) => {
  const entered = deferred<void>();
  const result = deferred<typeof tokens>();
  const app = await fixture(t, {
    exchange: async () => {
      entered.resolve();
      return result.promise;
    },
  });
  const { state } = await app.start();
  const pending = app.complete(state);
  await entered.promise;
  app.auth.revokeSession(app.owner.sessionId, app.owner.userId);
  result.resolve(tokens);
  assert.deepEqual(await (await pending).json(), { result: "error" });
  assert.deepEqual(await app.status(app.login("owner")), {
    kind: "disconnected",
  });
});
