import type { IncomingMessage, ServerResponse } from "node:http";
import { pickQuestionSchema } from "@panky/shared";
import {
  HttpError,
  json,
  readJson,
  type RequestAccess,
} from "../http-utils.js";
import type { PicksCatalogue } from "./catalogue.js";
import type { PicksStore } from "./store.js";
import type { PicksService } from "./service.js";

export class PicksApi {
  constructor(
    private readonly store: PicksStore,
    private readonly service: PicksService,
    private readonly catalogue: PicksCatalogue,
  ) {}
  async route(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    access: RequestAccess,
  ) {
    if (path === "/api/picks/refresh") {
      if (request.method !== "POST")
        throw new HttpError(405, "Method not allowed.");
      if (!access.isOwner)
        throw new HttpError(403, "Only the owner can refresh Picks data.");
      if (
        request.headers["transfer-encoding"] ||
        Number(request.headers["content-length"] ?? 0) > 0
      )
        throw new HttpError(400, "Refresh does not accept a request body.");
      const result = await this.catalogue.refresh();
      access.assertAccess();
      json(response, 200, result);
      return true;
    }
    if (path === "/api/picks") {
      if (request.method !== "GET")
        throw new HttpError(405, "Method not allowed.");
      await this.catalogue.ready();
      access.assertAccess();
      json(response, 200, this.catalogue.list());
      return true;
    }
    const match = /^\/api\/picks\/([^/]+)\/analysis$/.exec(path);
    if (!match) return false;
    await this.catalogue.ready();
    access.assertAccess();
    const fixture = this.catalogue.find(match[1] ?? "");
    if (!fixture) throw new HttpError(404, "Match not found.");
    if (request.method === "GET") {
      json(response, 200, {
        messages: this.store.messages(access.userId, fixture.id),
      });
      return true;
    }
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    const parsed = pickQuestionSchema.safeParse(await readJson(request));
    access.assertAccess();
    if (!parsed.success)
      throw new HttpError(400, "Question must contain 1–2000 characters.");
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    response.once("close", disconnect);
    if (response.destroyed) controller.abort();
    try {
      const result = await this.service.explain(
        access.userId,
        fixture,
        parsed.data.question,
        controller.signal,
      );
      access.assertAccess();
      if (!response.destroyed) json(response, 200, result);
    } finally {
      response.off("close", disconnect);
    }
    return true;
  }
}
