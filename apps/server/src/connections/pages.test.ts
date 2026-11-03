import assert from "node:assert/strict";
import { test } from "node:test";
import { searchNotionPages } from "./pages.js";
import { NotionAuthorizationError } from "./notion.js";

const id = "11111111-1111-4111-8111-111111111111";
const page = {
  object: "page",
  id,
  properties: {
    Name: { type: "title", title: [{ plain_text: "My migration" }] },
  },
};
const signal = new AbortController().signal;

test("Notion discovery sends bounded title search with private credentials and validates pagination", async () => {
  const result = await searchNotionPages(
    { query: "migration", cursor: "first" },
    "private-token",
    signal,
    async (url, init) => {
      assert.equal(url, "https://api.notion.com/v1/search");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer private-token",
      );
      assert.equal(init?.redirect, "error");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        query: "migration",
        start_cursor: "first",
        page_size: 20,
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
      });
      return Response.json({
        results: [page, { ...page, in_trash: true }],
        has_more: true,
        next_cursor: "second",
      });
    },
  );
  assert.deepEqual(result, {
    pages: [{ id, title: "My migration" }],
    nextCursor: "second",
  });
});

test("Notion discovery rejects oversized responses, unknown shapes and repeated cursors", async () => {
  for (const response of [
    () =>
      Response.json({ results: [page], has_more: true, next_cursor: "first" }),
    () => Response.json({ results: [page], has_more: true, next_cursor: null }),
    () =>
      Response.json({
        results: [{ ...page, id: "bad" }],
        has_more: false,
        next_cursor: null,
      }),
    () => new Response("x".repeat(1048577)),
  ])
    await assert.rejects(
      searchNotionPages(
        { cursor: "first" },
        "private-token",
        signal,
        async () => response(),
      ),
    );
});

test("Notion discovery sanitizes rate limits and authorization failures without automatic retries", async () => {
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    await assert.rejects(
      searchNotionPages({}, "private-token", signal, async () => {
        calls++;
        return new Response("provider-secret", { status });
      }),
      (error: unknown) => {
        assert(error instanceof Error);
        assert(!error.message.includes("provider-secret"));
        assert.equal(
          error instanceof NotionAuthorizationError,
          status === 401 || status === 403,
        );
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
