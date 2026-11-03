import type { IncomingMessage, ServerResponse } from "node:http";
import {
  EXPERIENCE_LIMITS,
  importExperienceSchema,
  notionPageSearchSchema,
  notionPagesSchema,
} from "@panky/shared";
import { z } from "zod";
import { HttpError, json, readJson } from "../http-utils.js";
import { importNotionPage, normalizePageId } from "../experience/notion.js";
import type { ExperienceStore } from "../experience/store.js";
import { searchNotionPages } from "./pages.js";
import { NotionAuthorizationError } from "./notion.js";

export type ContentAccess = {
  connectionId: string;
  token: string;
  signal: AbortSignal;
  assertCurrent: () => void;
};
export type ContentOperation = <T>(
  operation: (access: ContentAccess) => Promise<T>,
) => Promise<T>;
const root = "/api/connections/notion";

export class ConnectionSources {
  constructor(
    private readonly store: ExperienceStore,
    private readonly importer: typeof importNotionPage = importNotionPage,
    private readonly searcher: typeof searchNotionPages = searchNotionPages,
  ) {}

  async route(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    userId: string,
    connectionId: string | null,
    run: ContentOperation,
    assertCurrent: () => void,
    busy: () => boolean,
  ) {
    if (path === `${root}/pages/search`) {
      if (request.method !== "POST")
        throw new HttpError(405, "Method not allowed.");
      const input = notionPageSearchSchema.safeParse(await readJson(request));
      if (!input.success)
        throw new HttpError(
          400,
          "Enter a page title and a valid pagination cursor.",
        );
      const result = await run(
        async ({ token, signal, assertCurrent: current }) => {
          const result = notionPagesSchema.parse(
            await this.searcher(input.data, token, signal),
          );
          current();
          return result;
        },
      );
      json(response, 200, result);
      return true;
    }
    if (path !== `${root}/sources` && !path.startsWith(`${root}/sources/`))
      return false;
    const sources = () =>
      this.store
        .list(userId)
        .filter(
          (source) =>
            connectionId !== null && source.connectionId === connectionId,
        );
    if (path === `${root}/sources` && request.method === "GET") {
      json(response, 200, { sources: sources() });
      return true;
    }
    const match =
      /^\/api\/connections\/notion\/sources\/([^/]+)(\/refresh)?$/.exec(path);
    let sourceId: string | undefined;
    let pageId: string;
    if (match) {
      const id = z.uuid().safeParse(match[1]);
      if (!id.success) throw new HttpError(400, "Invalid source ID.");
      sourceId = id.data;
      const detail = this.store.detail(userId, sourceId);
      if (
        !detail ||
        !connectionId ||
        detail.source.connectionId !== connectionId
      )
        throw new HttpError(404, "Source not found.");
      if (!match[2] && request.method === "GET") {
        json(response, 200, detail);
        return true;
      }
      if (!match[2] && request.method === "DELETE") {
        assertCurrent();
        if (busy())
          throw new HttpError(
            409,
            "Wait for the current connection request to finish.",
          );
        this.store.remove(userId, sourceId);
        response.writeHead(204).end();
        return true;
      }
      if (!match[2] || request.method !== "POST")
        throw new HttpError(405, "Method not allowed.");
      pageId = detail.source.pageId;
    } else if (path === `${root}/sources` && request.method === "POST") {
      const parsed = importExperienceSchema.safeParse(await readJson(request));
      if (!parsed.success)
        throw new HttpError(400, "Provide a Notion page link or ID.");
      pageId = normalizePageId(parsed.data.page);
    } else throw new HttpError(404, "Endpoint not found.");
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    response.once("close", disconnect);
    if (response.destroyed) controller.abort();
    try {
      const result = await run(async (access) => {
        const signal = AbortSignal.any([
          access.signal,
          controller.signal,
          AbortSignal.timeout(30000),
        ]);
        const previous = this.store.findByPage(userId, pageId);
        if (
          !previous &&
          this.store.list(userId).length >= EXPERIENCE_LIMITS.sources
        )
          throw new HttpError(
            409,
            `Remove a source before importing more than ${EXPERIENCE_LIMITS.sources} pages.`,
          );
        try {
          const imported = await this.importer(pageId, access.token, signal);
          signal.throwIfAborted();
          access.assertCurrent();
          if (imported.pageId !== pageId)
            throw new HttpError(502, "Notion returned a different page.");
          return this.store.replace(userId, imported, access.connectionId);
        } catch (error) {
          access.assertCurrent();
          const message = signal.aborted
            ? "The import was interrupted or exceeded its time limit. Refresh manually to try again."
            : error instanceof HttpError
              ? error.message
              : "Notion import could not be completed. Try again manually.";
          if (previous?.connectionId === access.connectionId)
            this.store.fail(userId, previous.id, message);
          if (error instanceof NotionAuthorizationError) throw error;
          throw new HttpError(
            error instanceof HttpError ? error.status : 502,
            message,
          );
        }
      });
      json(response, sourceId ? 200 : 201, result);
    } finally {
      response.off("close", disconnect);
    }
    return true;
  }
}
