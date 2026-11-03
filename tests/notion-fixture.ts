import { setTimeout } from "node:timers/promises";
import { HttpError } from "../apps/server/src/http-utils.js";
import {
  NotionAuthorizationError,
  NotionTemporaryError,
  type NotionOAuth,
} from "../apps/server/src/connections/notion.js";

function tokens(code: string) {
  return {
    access_token: `synthetic-notion-access-${code}`,
    refresh_token: `synthetic-notion-refresh-${code}`,
    token_type: "bearer" as const,
    workspace_id:
      code === "friend"
        ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspace_name: code === "friend" ? "Friend workspace" : "Owner workspace",
    bot_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  };
}

export const notionFixture: NotionOAuth = {
  async exchange(code) {
    if (code === "failure")
      throw new HttpError(502, "Synthetic Notion exchange failed.");
    for (const key of pageImports.keys())
      if (key.startsWith(`synthetic-notion-access-${code}:`))
        pageImports.delete(key);
    return tokens(code);
  },
  async refresh(refreshToken) {
    if (refreshToken.endsWith("temporary")) throw new NotionTemporaryError();
    if (refreshToken.endsWith("revoked"))
      throw new NotionAuthorizationError("Synthetic grant revoked.");
    return tokens(refreshToken.endsWith("friend") ? "friend" : "owner");
  },
  async check(accessToken) {
    if (accessToken.endsWith("revoked") || accessToken.endsWith("temporary"))
      throw new NotionAuthorizationError("Synthetic token expired.");
  },
};

export const personalPages = {
  migration: "44444444-4444-4444-8444-444444444444",
  delivery: "55555555-5555-4555-8555-555555555555",
  slow: "66666666-6666-4666-8666-666666666666",
  unavailable: "77777777-7777-4777-8777-777777777777",
};
const pageImports = new Map<string, number>();
export async function personalImporter(
  pageId: string,
  token: string,
  signal: AbortSignal,
) {
  const key = `${token}:${pageId}`;
  const attempt = (pageImports.get(key) ?? 0) + 1;
  pageImports.set(key, attempt);
  if (pageId === personalPages.slow)
    await setTimeout(2000, undefined, { signal });
  if (
    pageId === personalPages.unavailable ||
    !Object.values(personalPages).includes(pageId)
  )
    throw new HttpError(
      404,
      "This page is unavailable. Check its sharing permissions in Notion.",
    );
  if (pageId === personalPages.delivery && attempt > 1)
    throw new HttpError(
      429,
      "Notion rate limit reached. Refresh this page manually later.",
    );
  const account = token.endsWith("friend") ? "Friend" : "Owner";
  const label =
    pageId === personalPages.migration
      ? "migration"
      : pageId === personalPages.delivery
        ? "delivery"
        : "slow page";
  return {
    pageId,
    title: `${account} ${label}`,
    passages: [
      {
        blockId: "88888888-8888-4888-8888-888888888888",
        text: `${account} evidence: I planned the ${label} and rehearsed rollback. Revision ${attempt}.`,
      },
    ],
    warnings:
      pageId === personalPages.delivery
        ? [
            "Unsupported image omitted. Child pages must be imported separately.",
          ]
        : [],
  };
}
export async function personalSearcher(
  input: { query?: string; cursor?: string },
  token: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const account = token.endsWith("friend") ? "Friend" : "Owner";
  const all = [
    { id: personalPages.migration, title: `${account} migration` },
    { id: personalPages.delivery, title: `${account} delivery` },
    { id: personalPages.slow, title: `${account} slow page` },
  ].filter((page) =>
    page.title.toLowerCase().includes((input.query ?? "").toLowerCase()),
  );
  const offset = input.cursor === "next" ? 2 : 0;
  return {
    pages: all.slice(offset, offset + 2),
    nextCursor: all.length > offset + 2 ? "next" : null,
  };
}
