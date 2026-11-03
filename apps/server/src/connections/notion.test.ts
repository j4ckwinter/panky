import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NotionAuthorizationError,
  NotionOAuthClient,
  NotionTemporaryError,
} from "./notion.js";
import { tokens } from "./test-support.js";

test("Notion OAuth exchanges codes and rotates refresh tokens using bounded fixed-origin requests", async () => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const client = new NotionOAuthClient(
    "client",
    "secret",
    async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json(
        String(url).endsWith("users/me")
          ? { object: "user", type: "bot", id: tokens.bot_id }
          : tokens,
      );
    },
  );
  const signal = new AbortController().signal;
  assert.deepEqual(
    await client.exchange(
      "code",
      "https://panky.example/api/connections/notion/callback",
      signal,
    ),
    tokens,
  );
  assert.deepEqual(await client.refresh("refresh", signal), tokens);
  await client.check("access", signal);
  assert.equal(requests[0]?.url, "https://api.notion.com/v1/oauth/token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    grant_type: "authorization_code",
    code: "code",
    redirect_uri: "https://panky.example/api/connections/notion/callback",
  });
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    grant_type: "refresh_token",
    refresh_token: "refresh",
  });
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("authorization"),
    `Basic ${Buffer.from("client:secret").toString("base64")}`,
  );
  assert.equal(
    new Headers(requests[2]?.init?.headers).get("authorization"),
    "Bearer access",
  );
  assert(
    requests.every(({ init }) => init?.redirect === "error" && init.signal),
  );
});

test("Notion failures are categorized without exposing provider response content", async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    const client = new NotionOAuthClient(
      "client",
      "secret",
      async () => new Response("sensitive-provider-error", { status }),
    );
    await assert.rejects(
      client.check("access", new AbortController().signal),
      (error) => {
        assert(error instanceof Error && !error.message.includes("sensitive"));
        return status < 429
          ? error instanceof NotionAuthorizationError
          : error instanceof NotionTemporaryError;
      },
    );
  }
});

test("Notion responses reject oversized content and malformed token pairs", async () => {
  for (const body of [
    "x".repeat(65537),
    JSON.stringify({ access_token: "alone" }),
    JSON.stringify({ ...tokens, refresh_token: "" }),
  ]) {
    const client = new NotionOAuthClient(
      "client",
      "secret",
      async () => new Response(body),
    );
    await assert.rejects(
      client.exchange(
        "code",
        "http://localhost/callback",
        new AbortController().signal,
      ),
    );
  }
});
