import type { IncomingMessage, ServerResponse } from "node:http";
import { EXPERIENCE_LIMITS, importExperienceSchema } from "@panky/shared";
import { z } from "zod";
import { HttpError, json, readJson } from "../http-utils.js";
import { importNotionPage, normalizePageId } from "./notion.js";
import { ExperienceStore } from "./store.js";

export class ExperienceApi {
  private readonly active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  constructor(
    readonly store: ExperienceStore,
    private readonly token: string | undefined,
    private readonly importer: typeof importNotionPage = importNotionPage,
  ) {}

  async stop() {
    for (const job of this.active.values()) job.controller.abort();
    await Promise.allSettled([...this.active.values()].map((job) => job.done));
  }

  async route(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    userId: string,
    assertAccess: () => void,
  ) {
    if (path !== "/api/experience" && !path.startsWith("/api/experience/"))
      return false;
    const configured = userId === "owner" && Boolean(this.token);
    if (path === "/api/experience" && request.method === "GET") {
      json(response, 200, { configured, sources: this.store.list(userId) });
      return true;
    }
    const match = /^\/api\/experience\/([^/]+)(\/refresh)?$/.exec(path);
    let sourceId: string | undefined;
    if (match) {
      const id = z.uuid().safeParse(match[1]);
      if (!id.success) throw new HttpError(400, "Invalid source ID.");
      sourceId = id.data;
      const detail = this.store.detail(userId, sourceId);
      if (!detail) throw new HttpError(404, "Source not found.");
      if (!match[2] && request.method === "GET") {
        json(response, 200, detail);
        return true;
      }
      if (!match[2] && request.method === "DELETE") {
        if (this.active.has(userId))
          throw new HttpError(409, "Wait for the current import to finish.");
        this.store.remove(userId, sourceId);
        response.writeHead(204);
        response.end();
        return true;
      }
    } else if (path !== "/api/experience") {
      throw new HttpError(404, "Endpoint not found.");
    }
    if (request.method !== "POST" || (match && !match[2]))
      throw new HttpError(405, "Method not allowed.");
    if (!configured || !this.token)
      throw new HttpError(
        403,
        "Notion import requires the owner's server connection.",
      );
    let pageId: string;
    if (sourceId) {
      const detail = this.store.detail(userId, sourceId);
      if (!detail) throw new HttpError(404, "Source not found.");
      pageId = detail.source.pageId;
    } else {
      const parsed = importExperienceSchema.safeParse(await readJson(request));
      if (!parsed.success)
        throw new HttpError(400, "Provide a Notion page link or ID.");
      pageId = normalizePageId(parsed.data.page);
    }
    assertAccess();
    if (this.active.has(userId))
      throw new HttpError(409, "Wait for the current import to finish.");
    const existing = this.store.findByPage(userId, pageId);
    if (
      !existing &&
      this.store.list(userId).length >= EXPERIENCE_LIMITS.sources
    )
      throw new HttpError(
        400,
        `Remove a source before importing more than ${EXPERIENCE_LIMITS.sources} pages.`,
      );
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    response.once("close", disconnect);
    if (response.destroyed) controller.abort();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    const token = this.token;
    const done = Promise.resolve().then(async () => {
      try {
        const imported = await this.importer(pageId, token, signal);
        signal.throwIfAborted();
        assertAccess();
        if (imported.pageId !== pageId)
          throw new HttpError(502, "Notion returned a different page.");
        const source = this.store.replace(userId, imported);
        json(response, existing ? 200 : 201, source);
      } catch (error) {
        assertAccess();
        const message = signal.aborted
          ? "The import was interrupted or exceeded its time limit. Refresh manually to try again."
          : error instanceof HttpError
            ? error.message
            : "The Notion import could not be completed.";
        if (existing) this.store.fail(userId, existing.id, message);
        throw new HttpError(
          error instanceof HttpError ? error.status : 502,
          message,
        );
      } finally {
        response.off("close", disconnect);
        this.active.delete(userId);
      }
    });
    this.active.set(userId, { controller, done });
    await done;
    return true;
  }
}
