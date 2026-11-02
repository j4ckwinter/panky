import assert from "node:assert/strict";
import { test } from "node:test";
import { importNotionPage, normalizePageId } from "./notion.js";

const pageId = "b55c9c91-384d-452b-81db-d1ef79372b75";
const blockId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (plain_text: string) => [{ plain_text }];
const metadata = {
  object: "page",
  id: pageId,
  archived: false,
  properties: { Name: { type: "title", title: text("Migration notes") } },
};
const block = (n: number, content: string, has_children = false) => ({
  object: "block",
  id: blockId(n),
  type: "paragraph",
  has_children,
  paragraph: { rich_text: text(content) },
});
const list = (results: unknown[], next_cursor: string | null = null) => ({
  object: "list",
  results,
  has_more: next_cursor !== null,
  next_cursor,
});
function fixture(responses: unknown[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const value = responses.shift();
    assert.notEqual(value, undefined, "unexpected request");
    return value instanceof Response ? value : Response.json(value);
  };
  return { calls, fetcher };
}

test("Notion page IDs accept canonical links and reject arbitrary URLs", () => {
  for (const input of [
    pageId,
    pageId.replaceAll("-", "").toUpperCase(),
    `https://www.notion.so/Migration-${pageId.replaceAll("-", "")}?pvs=4`,
    `https://team.notion.site/${pageId}`,
    `https://notion.so/${pageId}`,
    `https://www.notion.com/Migration-${pageId.replaceAll("-", "")}`,
    `https://notion.com/${pageId}`,
  ]) {
    assert.equal(normalizePageId(input), pageId);
  }
  for (const input of [
    "",
    "garbage",
    `http://notion.so/${pageId}`,
    `https://notion.so.evil.com/${pageId}`,
    `https://evil.com/${pageId}`,
    `https://secret@notion.so/${pageId}`,
    `https://notion.so:444/${pageId}`,
    `https://notion.site.evil.com/${pageId}`,
    `file:///${pageId}`,
  ]) {
    assert.throws(() => normalizePageId(input), /Notion page link/);
  }
});

test("whitespace-only chunks are omitted without discarding surrounding code", async () => {
  const content = `start${" ".repeat(2400)}end`;
  const { fetcher } = fixture([
    metadata,
    list([
      {
        object: "block",
        id: blockId(1),
        type: "code",
        has_children: false,
        code: { rich_text: text(content) },
      },
    ]),
  ]);
  const imported = await importNotionPage(
    pageId,
    "test-token",
    new AbortController().signal,
    fetcher,
  );
  assert(imported.passages.every((passage) => passage.text.trim().length > 0));
  assert.equal(
    imported.passages.map((passage) => passage.text.trim()).join(" "),
    "start end",
  );
});

test("Notion import traverses supported nested content and pagination with fixed read-only requests", async () => {
  const { calls, fetcher } = fixture([
    metadata,
    list([block(1, "I compared rollout options.", true)], "next / cursor"),
    list([block(2, "The team chose a staged rollout.")]),
    list([
      {
        object: "block",
        id: blockId(3),
        type: "table_row",
        has_children: false,
        table_row: { cells: [text("Outcome"), text("No metric recorded")] },
      },
    ]),
  ]);
  const result = await importNotionPage(
    pageId,
    "private-test-secret",
    new AbortController().signal,
    fetcher,
  );
  assert.equal(result.title, "Migration notes");
  assert.deepEqual(
    result.passages.map((item) => item.text),
    [
      "I compared rollout options.",
      "The team chose a staged rollout.",
      "Outcome | No metric recorded",
    ],
  );
  assert.deepEqual(result.warnings, []);
  assert.equal(calls.length, 4);
  assert(calls[3]?.url.endsWith("start_cursor=next%20%2F%20cursor"));
  for (const call of calls) {
    assert(call.url.startsWith("https://api.notion.com/v1/"));
    assert.equal(call.init?.method, "GET");
    assert.equal(call.init?.redirect, "error");
    assert.equal(
      new Headers(call.init?.headers).get("Notion-Version"),
      "2026-03-11",
    );
  }
});

test("unsupported blocks and child pages are reported without following references", async () => {
  const { fetcher, calls } = fixture([
    metadata,
    list([
      {
        object: "block",
        id: blockId(1),
        type: "child_page",
        has_children: true,
        child_page: { title: "Private child" },
      },
      {
        object: "block",
        id: blockId(2),
        type: "synced_block",
        has_children: true,
        synced_block: { synced_from: { block_id: blockId(3) } },
      },
      block(4, "Selected page content"),
    ]),
  ]);
  const result = await importNotionPage(
    pageId,
    "secret",
    new AbortController().signal,
    fetcher,
  );
  assert.equal(calls.length, 2);
  assert.equal(result.passages.length, 1);
  assert.match(result.warnings.join(" "), /Child pages.*explicitly/);
  assert.match(result.warnings.join(" "), /synced_block/);
});

test("long content is chunked without splitting surrogate pairs and reports truncation", async () => {
  const { fetcher } = fixture([
    metadata,
    list([block(1, "a".repeat(1199) + "😀" + "x".repeat(65000))]),
  ]);
  const result = await importNotionPage(
    pageId,
    "secret",
    new AbortController().signal,
    fetcher,
  );
  assert(
    result.passages.every(
      (item) =>
        item.text.length <= 1200 &&
        Buffer.from(item.text).toString("utf8") === item.text,
    ),
  );
  assert(result.passages.length <= 100);
  assert.equal(
    result.passages.reduce((sum, item) => sum + item.text.length, 0),
    60000,
  );
  assert.match(result.warnings.join(" "), /truncated/);
});

test("deep content is bounded and a repeated pagination cursor fails clearly", async () => {
  const { fetcher, calls } = fixture([
    metadata,
    ...Array.from({ length: 6 }, (_, i) =>
      list([block(i + 1, `Level ${i}`, true)]),
    ),
  ]);
  const result = await importNotionPage(
    pageId,
    "secret",
    new AbortController().signal,
    fetcher,
  );
  assert.equal(calls.length, 7);
  assert.equal(result.passages.length, 6);
  assert.match(result.warnings.join(" "), /depth 5/);
  const repeated = fixture([metadata, list([], "same"), list([], "same")]);
  await assert.rejects(
    importNotionPage(
      pageId,
      "secret",
      new AbortController().signal,
      repeated.fetcher,
    ),
    /invalid pagination/,
  );
});

test("Notion errors are sanitized, not retried, and malformed content cannot replace an import", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const { fetcher, calls } = fixture([
      new Response("private-test-secret and internal details", { status }),
    ]);
    await assert.rejects(
      importNotionPage(
        pageId,
        "private-test-secret",
        new AbortController().signal,
        fetcher,
      ),
      (error: unknown) => {
        assert(error instanceof Error);
        assert(!error.message.includes("private-test-secret"));
        assert(!error.message.includes("internal details"));
        if (status === 429) assert.match(error.message, /rate limit/);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  }
  const invalid = fixture([
    metadata,
    list([{ ...block(1, ""), paragraph: { rich_text: "wrong" } }]),
  ]);
  await assert.rejects(
    importNotionPage(
      pageId,
      "secret",
      new AbortController().signal,
      invalid.fetcher,
    ),
    /previous import was not replaced/,
  );
});

test("archived pages, oversized responses and cancellation stop imports", async () => {
  const archived = fixture([{ ...metadata, in_trash: true }]);
  await assert.rejects(
    importNotionPage(
      pageId,
      "secret",
      new AbortController().signal,
      archived.fetcher,
    ),
    /archived/,
  );
  const oversized = fixture([new Response("x".repeat(1048577))]);
  await assert.rejects(
    importNotionPage(
      pageId,
      "secret",
      new AbortController().signal,
      oversized.fetcher,
    ),
    /size limit/,
  );
  const controller = new AbortController();
  controller.abort();
  const cancelled = fixture([]);
  await assert.rejects(
    importNotionPage(pageId, "secret", controller.signal, cancelled.fetcher),
    /interrupted/,
  );
  assert.equal(cancelled.calls.length, 0);
});

test("many unsupported block types keep the warning list within storage limits", async () => {
  const unknown = (start: number) =>
    Array.from({ length: 100 }, (_, i) => ({
      object: "block",
      id: blockId(start + i),
      type: `unsupported_${start + i}`,
      has_children: false,
    }));
  const { fetcher } = fixture([
    metadata,
    list(unknown(1), "next"),
    list(unknown(101)),
  ]);
  const result = await importNotionPage(
    pageId,
    "secret",
    new AbortController().signal,
    fetcher,
  );
  assert.equal(result.warnings.length, 100);
  assert.match(result.warnings.at(-1) ?? "", /warnings were omitted/);
  assert.deepEqual(result.passages, []);
});
