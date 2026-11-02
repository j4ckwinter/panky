import { EXPERIENCE_LIMITS } from "@panky/shared";
import type { ImportedPage } from "./imported-page.js";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { HttpError } from "../http-utils.js";

const identifier =
  /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const idSchema = z.string().regex(identifier);
const richTextSchema = z.array(z.object({ plain_text: z.string() })).max(1000);
const pageSchema = z.object({
  object: z.literal("page"),
  id: idSchema,
  archived: z.boolean().optional(),
  in_trash: z.boolean().optional(),
  properties: z.record(z.string(), z.unknown()),
});
const blocksSchema = z.object({
  object: z.literal("list"),
  results: z
    .array(
      z
        .object({
          object: z.literal("block"),
          id: idSchema,
          type: z.string().max(100),
          has_children: z.boolean(),
        })
        .catchall(z.unknown()),
    )
    .max(100),
  has_more: z.boolean(),
  next_cursor: z.string().max(1000).nullable(),
});
const textTypes = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "toggle",
  "quote",
  "callout",
  "code",
]);
const containers = new Set(["table", "column", "column_list"]);

function canonicalId(input: string) {
  const hex = input.replaceAll("-", "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizePageId(input: string): string {
  const value = input.trim();
  if (identifier.test(value)) return canonicalId(value);
  if (URL.canParse(value)) {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "notion.so" ||
        url.hostname === "www.notion.so" ||
        url.hostname === "notion.com" ||
        url.hostname === "www.notion.com" ||
        url.hostname.endsWith(".notion.site"))
    ) {
      const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      const candidate = segment.match(
        /(?:^|-)([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i,
      )?.[1];
      if (candidate) return canonicalId(candidate);
    }
  }
  throw new HttpError(400, "Enter a Notion page link or page ID.");
}

export async function importNotionPage(
  pageId: string,
  token: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ImportedPage> {
  const id = normalizePageId(pageId);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  const warnings = new Set<string>();
  const passages: ImportedPage["passages"] = [];
  let requests = 0;
  let lastRequest = 0;
  let blocks = 0;
  let chars = 0;
  let limited = false;
  const seen = new Set<string>();

  const read = async (path: string): Promise<unknown> => {
    deadline.throwIfAborted();
    if (requests >= 20)
      throw new HttpError(
        422,
        "Notion import exceeded its request limit. Import a smaller page.",
      );
    const delay = lastRequest + 350 - Date.now();
    if (delay > 0) await setTimeout(delay, undefined, { signal: deadline });
    requests++;
    lastRequest = Date.now();
    const response = await fetcher(`https://api.notion.com/v1/${path}`, {
      method: "GET",
      redirect: "error",
      signal: deadline,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2026-03-11",
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? "Notion rate limit reached. Try refreshing later."
          : response.status === 401 || response.status === 403
            ? "Notion denied access. Check the server integration and page permissions."
            : response.status === 404
              ? "Notion page content is unavailable. Share the page with the server integration."
              : "Notion could not provide this page. Try refreshing later.",
      );
    }
    if (!response.body)
      throw new HttpError(502, "Notion returned an empty response.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "";
    let bytes = 0;
    try {
      while (true) {
        deadline.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1048576)
          throw new HttpError(
            422,
            "Notion page response exceeds the import size limit.",
          );
        text += decoder.decode(part.value, { stream: true });
      }
      return JSON.parse(text + decoder.decode()) as unknown;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  };

  const addText = (blockId: string, text: string) => {
    const clean = text.trim();
    for (let offset = 0; offset < clean.length; ) {
      if (
        chars >= EXPERIENCE_LIMITS.totalChars ||
        passages.length >= EXPERIENCE_LIMITS.passages
      ) {
        warnings.add(
          `Import truncated at ${EXPERIENCE_LIMITS.passages} passages or ${EXPERIENCE_LIMITS.totalChars.toLocaleString("en-US")} characters.`,
        );
        limited = true;
        return;
      }
      let end = Math.min(
        offset + EXPERIENCE_LIMITS.passageChars,
        clean.length,
        offset + EXPERIENCE_LIMITS.totalChars - chars,
      );
      if (end < clean.length && /[\uD800-\uDBFF]/.test(clean[end - 1] ?? ""))
        end--;
      if (end <= offset) {
        limited = true;
        warnings.add("Import truncated at the character limit.");
        return;
      }
      const chunk = clean.slice(offset, end);
      if (chunk.trim()) passages.push({ blockId, text: chunk });
      chars += chunk.length;
      offset = end;
    }
  };

  const children = async (parent: string, depth: number): Promise<void> => {
    if (depth > 5) {
      warnings.add("Nested content beyond depth 5 was skipped.");
      return;
    }
    let cursor: string | null = null;
    const cursors = new Set<string>();
    do {
      if (requests >= 20) {
        warnings.add("Import truncated at 20 Notion requests.");
        limited = true;
        return;
      }
      const page = blocksSchema.parse(
        await read(
          `blocks/${parent}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
        ),
      );
      for (const block of page.results) {
        if (++blocks > 500) {
          warnings.add("Import truncated at 500 blocks.");
          limited = true;
          return;
        }
        const blockId = canonicalId(block.id);
        if (seen.has(blockId)) {
          warnings.add("Repeated block references were skipped.");
          continue;
        }
        seen.add(blockId);
        const supported =
          textTypes.has(block.type) ||
          containers.has(block.type) ||
          block.type === "table_row";
        if (!supported) {
          warnings.add(
            block.type === "child_page" || block.type === "child_database"
              ? "Child pages and databases were skipped. Import each desired page explicitly."
              : `Unsupported block type skipped: ${block.type}.`,
          );
          continue;
        }
        if (textTypes.has(block.type)) {
          const payload = z
            .object({ rich_text: richTextSchema })
            .parse(block[block.type]);
          addText(
            blockId,
            payload.rich_text.map((part) => part.plain_text).join(""),
          );
        } else if (block.type === "table_row") {
          const payload = z
            .object({ cells: z.array(richTextSchema).max(100) })
            .parse(block.table_row);
          addText(
            blockId,
            payload.cells
              .map((cell) => cell.map((part) => part.plain_text).join(""))
              .join(" | "),
          );
        }
        if (limited) return;
        if (block.has_children) await children(blockId, depth + 1);
        if (limited) return;
      }
      cursor = page.has_more ? page.next_cursor : null;
      if (page.has_more && (!cursor || cursors.has(cursor)))
        throw new HttpError(502, "Notion returned invalid pagination.");
      if (cursor) cursors.add(cursor);
    } while (cursor && !limited);
  };

  try {
    const page = pageSchema.parse(await read(`pages/${id}`));
    if (canonicalId(page.id) !== id || page.archived || page.in_trash)
      throw new HttpError(502, "Notion page is unavailable or archived.");
    let title = "Untitled Notion page";
    for (const value of Object.values(page.properties)) {
      const property = z
        .object({ type: z.literal("title"), title: richTextSchema })
        .safeParse(value);
      if (property.success) {
        title =
          property.data.title
            .map((part) => part.plain_text)
            .join("")
            .trim() || title;
        break;
      }
    }
    if (title.length > EXPERIENCE_LIMITS.titleChars)
      warnings.add(
        `Page title was shortened to ${EXPERIENCE_LIMITS.titleChars} characters.`,
      );
    await children(id, 0);
    return {
      pageId: id,
      title: title.slice(0, EXPERIENCE_LIMITS.titleChars),
      passages,
      warnings:
        warnings.size > EXPERIENCE_LIMITS.warnings
          ? [...warnings]
              .slice(0, EXPERIENCE_LIMITS.warnings - 1)
              .concat("Additional unsupported content warnings were omitted.")
          : [...warnings],
    };
  } catch (error) {
    if (deadline.aborted)
      throw new HttpError(
        408,
        "Notion import was interrupted or exceeded 30 seconds. Try again explicitly.",
      );
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Notion returned unavailable or invalid page content. The previous import was not replaced.",
    );
  }
}
