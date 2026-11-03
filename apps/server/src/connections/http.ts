import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { Auth } from "../auth/auth.js";
import { hashSecret } from "../auth/credentials.js";
import type { Config } from "../config.js";
import { HttpError, json, readJson } from "../http-utils.js";
import { callbackPath, notionCallbackPage } from "./callback.js";
import {
  NotionAuthorizationError,
  NotionTemporaryError,
  NotionOAuthClient,
  notionTokensSchema,
  type NotionOAuth,
} from "./notion.js";
import { ConnectionStore } from "./store.js";

const root = "/api/connections/notion";
const completionSchema = z.union([
  z
    .object({
      state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      code: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      error: z.string().min(1).max(200),
    })
    .strict(),
]);
type Session = { userId: string; sessionId: string };
type Pending = Session & { revision: number; expiresAt: number };

export class ConnectionsApi {
  private readonly store: ConnectionStore;
  private readonly provider: NotionOAuth | undefined;
  private readonly pending = new Map<string, Pending>();
  private readonly active = new Map<
    string,
    { controller: AbortController; done: Promise<unknown> }
  >();
  constructor(
    private readonly config: Config,
    private readonly auth: Auth,
    provider?: NotionOAuth,
  ) {
    this.store = new ConnectionStore(
      config.DATABASE_PATH,
      config.NOTION_TOKEN_KEY,
    );
    if (
      config.NOTION_CLIENT_ID &&
      config.NOTION_CLIENT_SECRET &&
      config.NOTION_TOKEN_KEY
    ) {
      this.provider =
        provider ??
        new NotionOAuthClient(
          config.NOTION_CLIENT_ID,
          config.NOTION_CLIENT_SECRET,
        );
    }
  }
  async close() {
    this.pending.clear();
    for (const item of this.active.values()) item.controller.abort();
    await Promise.allSettled(
      [...this.active.values()].map((item) => item.done),
    );
    this.store.close();
  }
  private invalidate(userId: string) {
    for (const [key, item] of this.pending)
      if (item.userId === userId) this.pending.delete(key);
    this.active.get(userId)?.controller.abort();
  }
  private assertSession(
    request: IncomingMessage,
    session: Session,
    revision: number,
    signal: AbortSignal,
  ) {
    const current = this.auth.connectionSession(request);
    if (
      signal.aborted ||
      current?.sessionId !== session.sessionId ||
      current.userId !== session.userId ||
      this.store.revision(session.userId) !== revision
    ) {
      throw new HttpError(
        409,
        "The connection changed. Start again from Connections.",
      );
    }
  }
  private async run<T>(
    userId: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ) {
    if (this.active.has(userId))
      throw new HttpError(
        409,
        "Wait for the current connection request to finish.",
      );
    const controller = new AbortController();
    const done = Promise.resolve().then(() => operation(controller.signal));
    this.active.set(userId, { controller, done });
    try {
      return await done;
    } finally {
      if (this.active.get(userId)?.controller === controller)
        this.active.delete(userId);
    }
  }
  async route(request: IncomingMessage, response: ServerResponse, url: URL) {
    if (url.pathname !== root && !url.pathname.startsWith(`${root}/`))
      return false;
    response.setHeader("Referrer-Policy", "no-referrer");
    if (url.pathname === callbackPath && request.method === "GET") {
      notionCallbackPage(url, response, this.config.AUTH_ORIGIN);
      return true;
    }
    if (url.search)
      throw new HttpError(400, "Query parameters are not supported.");
    const session = this.auth.connectionSession(request);
    if (!session) throw new HttpError(401, "Sign in to manage connections.");
    const { userId } = session;
    if (url.pathname === root && request.method === "GET") {
      json(response, 200, this.store.status(userId, Boolean(this.provider)));
      return true;
    }
    if (url.pathname === root && request.method === "DELETE") {
      this.invalidate(userId);
      this.store.disconnect(userId);
      response.writeHead(204).end();
      return true;
    }
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    const provider = this.provider;
    if (!provider || !this.config.NOTION_CLIENT_ID)
      throw new HttpError(
        503,
        "Notion connections are not configured on this backend.",
      );
    if (url.pathname === `${root}/authorize`) {
      if (this.store.status(userId, true).kind === "connected")
        throw new HttpError(
          409,
          "Disconnect the current workspace before connecting another.",
        );
      for (const [key, pending] of this.pending)
        if (pending.expiresAt <= Date.now()) this.pending.delete(key);
      this.invalidate(userId);
      if (this.pending.size >= 100)
        throw new HttpError(
          429,
          "Too many connection attempts. Try again later.",
        );
      const revision = this.store.advance(userId);
      const state = randomBytes(32).toString("base64url");
      this.pending.set(hashSecret(state), {
        ...session,
        revision,
        expiresAt: Date.now() + 300000,
      });
      const authorization = new URL(
        "https://api.notion.com/v1/oauth/authorize",
      );
      authorization.search = new URLSearchParams({
        client_id: this.config.NOTION_CLIENT_ID,
        redirect_uri: `${this.config.AUTH_ORIGIN}${callbackPath}`,
        response_type: "code",
        owner: "user",
        state,
      }).toString();
      json(response, 200, { url: authorization.href });
      return true;
    }
    if (url.pathname === `${root}/complete`) {
      const parsed = completionSchema.safeParse(await readJson(request));
      if (!parsed.success) throw new HttpError(400, "Invalid Notion callback.");
      const input = parsed.data;
      const key = hashSecret(input.state);
      const pending = this.pending.get(key);
      if (
        !pending ||
        pending.sessionId !== session.sessionId ||
        pending.userId !== userId ||
        pending.expiresAt <= Date.now() ||
        pending.revision !== this.store.revision(userId)
      ) {
        throw new HttpError(
          400,
          "Notion connection expired. Start again from Connections.",
        );
      }
      this.pending.delete(key);
      if ("error" in input) {
        json(response, 200, {
          result: input.error === "access_denied" ? "denied" : "error",
        });
        return true;
      }
      try {
        await this.run(userId, async (signal) => {
          const tokens = notionTokensSchema.parse(
            await provider.exchange(
              input.code,
              `${this.config.AUTH_ORIGIN}${callbackPath}`,
              signal,
            ),
          );
          this.assertSession(request, session, pending.revision, signal);
          const previous = this.store.status(userId, true);
          if (
            (previous.kind === "connected" ||
              previous.kind === "reconnect_required") &&
            previous.workspace.id !== tokens.workspace_id
          )
            throw new HttpError(409, "Disconnect before changing workspaces.");
          this.store.save(userId, pending.revision, tokens);
        });
        json(response, 200, { result: "connected" });
      } catch {
        json(response, 200, { result: "error" });
      }
      return true;
    }
    if (url.pathname === `${root}/check`) {
      const revision = this.store.revision(userId);
      await this.run(userId, async (signal) => {
        const status = this.store.status(userId, true);
        if (status.kind !== "connected") return;
        let tokens;
        try {
          tokens = this.store.tokens(userId);
        } catch {
          this.store.requireReconnect(userId, revision);
          return;
        }
        if (!tokens) {
          this.store.requireReconnect(userId, revision);
          return;
        }
        try {
          await provider.check(tokens.access_token, signal);
        } catch (error) {
          this.assertSession(request, session, revision, signal);
          if (!(error instanceof NotionAuthorizationError))
            throw new HttpError(
              502,
              "Notion could not be reached. Try again later.",
            );
          if (!tokens.refresh_token) {
            this.store.requireReconnect(userId, revision);
            return;
          }
          try {
            const refreshed = notionTokensSchema.parse(
              await provider.refresh(tokens.refresh_token, signal),
            );
            this.assertSession(request, session, revision, signal);
            if (
              refreshed.workspace_id !== tokens.workspace_id ||
              refreshed.bot_id !== tokens.bot_id
            )
              throw new NotionAuthorizationError(
                "Notion returned a different connection.",
              );
            this.store.save(userId, revision, refreshed);
          } catch (error) {
            this.assertSession(request, session, revision, signal);
            if (error instanceof NotionTemporaryError) throw error;
            this.store.requireReconnect(userId, revision);
          }
        }
        this.assertSession(request, session, revision, signal);
      });
      json(response, 200, this.store.status(userId, true));
      return true;
    }
    throw new HttpError(404, "Endpoint not found.");
  }
}
