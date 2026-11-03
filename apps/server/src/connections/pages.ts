import {
  EXPERIENCE_LIMITS,
  notionPagesSchema,
  notionPageSearchSchema,
} from "@panky/shared";
import { z } from "zod";
import { HttpError } from "../http-utils.js";
import { normalizePageId } from "../experience/notion.js";
import { NotionAuthorizationError } from "./notion.js";

const resultSchema = z.object({
  results: z
    .array(
      z.object({
        object: z.literal("page"),
        id: z.string(),
        archived: z.boolean().optional(),
        in_trash: z.boolean().optional(),
        properties: z.record(z.string(), z.unknown()),
      }),
    )
    .max(20),
  has_more: z.boolean(),
  next_cursor: z.string().min(1).max(1000).nullable(),
});
const titleSchema = z.object({
  type: z.literal("title"),
  title: z.array(z.object({ plain_text: z.string() })).max(1000),
});

export async function searchNotionPages(
  input: { query?: string; cursor?: string },
  token: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const parsed = notionPageSearchSchema.parse(input);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  try {
    const response = await fetcher("https://api.notion.com/v1/search", {
      method: "POST",
      redirect: "error",
      signal: deadline,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2026-03-11",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: parsed.query ?? "",
        ...(parsed.cursor ? { start_cursor: parsed.cursor } : {}),
        page_size: 20,
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403)
        throw new NotionAuthorizationError();
      throw new HttpError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? "Notion rate limit reached. Search again later."
          : "Notion could not list pages. Try again later.",
      );
    }
    if (!response.body)
      throw new HttpError(502, "Notion returned an empty page list.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let raw: unknown;
    try {
      while (true) {
        deadline.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1048576)
          throw new HttpError(502, "Notion page list exceeded its size limit.");
        chunks.push(part.value);
      }
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const result = resultSchema.parse(raw);
    if (
      result.has_more &&
      (!result.next_cursor || result.next_cursor === parsed.cursor)
    )
      throw new HttpError(
        502,
        "Notion returned invalid pagination. Search again.",
      );
    return notionPagesSchema.parse({
      pages: result.results
        .filter((page) => !page.archived && !page.in_trash)
        .map((page) => {
          const property = Object.values(page.properties)
            .map((value) => titleSchema.safeParse(value))
            .find((value) => value.success);
          return {
            id: normalizePageId(page.id),
            title: (
              property?.data?.title
                .map((part) => part.plain_text)
                .join("")
                .trim() || "Untitled Notion page"
            ).slice(0, EXPERIENCE_LIMITS.titleChars),
          };
        }),
      nextCursor: result.has_more ? result.next_cursor : null,
    });
  } catch (error) {
    if (deadline.aborted)
      throw new HttpError(
        408,
        "Notion page search was interrupted or timed out. Search again explicitly.",
      );
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Notion returned an unavailable or invalid page list.",
    );
  }
}
