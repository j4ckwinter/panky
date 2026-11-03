import { HttpError } from "../apps/server/src/http-utils.js";
import {
  NotionAuthorizationError,
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
    return tokens(code);
  },
  async refresh(refreshToken) {
    if (refreshToken.endsWith("revoked"))
      throw new NotionAuthorizationError("Synthetic grant revoked.");
    return tokens(refreshToken.endsWith("friend") ? "friend" : "owner");
  },
  async check(accessToken) {
    if (accessToken.endsWith("revoked"))
      throw new NotionAuthorizationError("Synthetic token expired.");
  },
};
