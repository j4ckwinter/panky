import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NotionAuthorizationError,
  NotionOAuthClient,
  NotionTemporaryError,
} from "./notion.js";
import { deferred, fixture, tokens } from "./test-support.js";

test("an invalid access token rotates both tokens once, without leaking credentials", async (t) => {
  const checked: string[] = [];
  const refreshed: string[] = [];
  const app = await fixture(t, {
    check: async (token) => {
      checked.push(token);
      if (token === tokens.access_token) throw new NotionAuthorizationError();
    },
    refresh: async (token) => {
      refreshed.push(token);
      return {
        ...tokens,
        access_token: "new-access",
        refresh_token: "new-refresh",
      };
    },
  });
  await app.connect();
  const response = await app.post("/check");
  assert.equal(response.status, 200);
  const body = await response.text();
  assert(body.includes('"kind":"connected"'));
  assert(!body.includes("new-access"));
  await app.post("/check");
  assert.deepEqual(checked, [tokens.access_token, "new-access"]);
  assert.deepEqual(refreshed, [tokens.refresh_token]);
});

test("transient check errors retain credentials but failed refresh requires reconnect", async (t) => {
  let invalid = false;
  const app = await fixture(t, {
    check: async () => {
      if (invalid) throw new NotionAuthorizationError();
      throw new Error("private-network-error");
    },
    refresh: async () => {
      throw new Error("private-refresh-error");
    },
  });
  await app.connect();
  assert.equal((await app.post("/check")).status, 502);
  assert.equal((await app.status()).kind, "connected");
  invalid = true;
  const response = await app.post("/check");
  assert.equal(response.status, 200);
  assert.equal((await app.status()).kind, "reconnect_required");
  assert.equal(
    app.db
      .prepare(
        "SELECT encryptedTokens FROM notion_connections WHERE userId='owner'",
      )
      .get()?.encryptedTokens,
    null,
  );
});

test("reconnect cannot replace a workspace without disconnecting first", async (t) => {
  let replacement = false;
  const app = await fixture(t, {
    exchange: async () =>
      replacement
        ? { ...tokens, workspace_id: "290a942a-556a-4c6f-a2f6-a9ccbfaf6a6a" }
        : tokens,
    check: async () => {
      throw new NotionAuthorizationError();
    },
    refresh: async () => {
      throw new NotionAuthorizationError();
    },
  });
  await app.connect();
  await app.post("/check");
  replacement = true;
  const { state } = await app.start();
  assert.deepEqual(await (await app.complete(state)).json(), {
    result: "error",
  });
  const status = await app.status();
  assert.equal(status.kind, "reconnect_required");
  assert("workspace" in status && status.workspace.id === tokens.workspace_id);
  await app.request("", { method: "DELETE" });
  await app.connect();
});

test("a definite temporary refresh failure preserves the refresh token for an explicit retry", async (t) => {
  let unavailable = true;
  const refreshed: string[] = [];
  const app = await fixture(t, {
    check: async () => {
      throw new NotionAuthorizationError();
    },
    refresh: async (token) => {
      refreshed.push(token);
      if (unavailable) throw new NotionTemporaryError();
      return tokens;
    },
  });
  await app.connect();
  assert.equal((await app.post("/check")).status, 502);
  assert.equal((await app.status()).kind, "connected");
  unavailable = false;
  assert.equal((await app.post("/check")).status, 200);
  assert.deepEqual(refreshed, [tokens.refresh_token, tokens.refresh_token]);
});

test("disconnect during refresh aborts it and prevents a late rotation restoring tokens", async (t) => {
  const entered = deferred<void>();
  const rotated = deferred<typeof tokens>();
  const app = await fixture(t, {
    check: async () => {
      throw new NotionAuthorizationError();
    },
    refresh: async () => {
      entered.resolve();
      return rotated.promise;
    },
  });
  await app.connect();
  const pending = app.post("/check");
  await entered.promise;
  assert.equal((await app.post("/check")).status, 409);
  await app.request("", { method: "DELETE" });
  rotated.resolve(tokens);
  assert.equal((await pending).status, 409);
  assert.deepEqual(await app.status(), { kind: "disconnected" });
});

for (const temporaryStatus of [429, 503]) {
  test(`expired access then HTTP ${temporaryStatus} retains refresh credentials for manual retry`, async (t) => {
    let refreshes = 0;
    const client = new NotionOAuthClient(
      "client",
      "secret",
      async (url, init) => {
        if (String(url).endsWith("users/me"))
          return new Response(null, { status: 401 });
        const body: unknown = JSON.parse(String(init?.body));
        assert(body && typeof body === "object" && "grant_type" in body);
        if (body.grant_type === "refresh_token") {
          assert(
            "refresh_token" in body &&
              body.refresh_token === tokens.refresh_token,
          );
          if (++refreshes === 1)
            return new Response(null, { status: temporaryStatus });
        }
        return Response.json(tokens);
      },
    );
    const app = await fixture(t, {
      exchange: client.exchange.bind(client),
      refresh: client.refresh.bind(client),
      check: client.check.bind(client),
    });
    await app.connect();
    assert.equal((await app.post("/check")).status, 502);
    assert.equal((await app.status()).kind, "connected");
    assert.equal((await app.post("/check")).status, 200);
    assert.equal(refreshes, 2);
  });
}
