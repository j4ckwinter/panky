import { z } from "zod";
import { HttpError } from "../http-utils.js";

export const notionTokensSchema = z.object({
  access_token: z.string().min(1).max(2000),
  refresh_token: z.string().min(1).max(2000).nullable(),
  token_type: z.literal("bearer"),
  workspace_id: z.uuid(),
  workspace_name: z.string().max(200).nullable(),
  bot_id: z.uuid(),
});
export type NotionTokens = z.infer<typeof notionTokensSchema>;
export class NotionAuthorizationError extends Error {}
export class NotionTemporaryError extends HttpError {
  constructor() {
    super(502, "Notion could not be reached. Try again later.");
  }
}
export interface NotionOAuth {
  exchange(
    code: string,
    redirectUri: string,
    signal: AbortSignal,
  ): Promise<NotionTokens>;
  refresh(refreshToken: string, signal: AbortSignal): Promise<NotionTokens>;
  check(accessToken: string, signal: AbortSignal): Promise<void>;
}

export class NotionOAuthClient implements NotionOAuth {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(
    path: string,
    authorization: string,
    signal: AbortSignal,
    body?: unknown,
  ) {
    const response = await this.fetcher(`https://api.notion.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "Notion-Version": "2026-03-11",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403
      )
        throw new NotionAuthorizationError(
          "Notion authorization is no longer valid.",
        );
      throw new NotionTemporaryError();
    }
    if (!response.body)
      throw new HttpError(502, "Notion returned an invalid response.");
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > 65536)
          throw new HttpError(502, "Notion returned an invalid response.");
        chunks.push(result.value);
      }
      const result: unknown = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      );
      return result;
    } finally {
      await reader.cancel();
    }
  }

  private async token(body: unknown, signal: AbortSignal) {
    const authorization = `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`;
    return notionTokensSchema.parse(
      await this.request("oauth/token", authorization, signal, body),
    );
  }
  exchange(code: string, redirectUri: string, signal: AbortSignal) {
    return this.token(
      { grant_type: "authorization_code", code, redirect_uri: redirectUri },
      signal,
    );
  }
  refresh(refreshToken: string, signal: AbortSignal) {
    return this.token(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      signal,
    );
  }
  async check(accessToken: string, signal: AbortSignal) {
    z.object({
      object: z.literal("user"),
      type: z.literal("bot"),
      id: z.uuid(),
    }).parse(await this.request("users/me", `Bearer ${accessToken}`, signal));
  }
}
