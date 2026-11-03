import type { GoogleIdentity } from "../apps/server/src/auth/google.js";
import { loadConfig } from "../apps/server/src/config.js";
import { createApp } from "../apps/server/src/http.js";
import { HttpError } from "../apps/server/src/http-utils.js";
import {
  notionFixture,
  personalImporter,
  personalPages,
  personalSearcher,
} from "./notion-fixture.js";

const config = loadConfig({
  AUTH_TOKEN: "panky-browser-test-token-never-use-in-production",
  PORT: "3101",
  DATABASE_PATH: ":memory:",
  AUTH_ORIGIN: "http://localhost:5174",
  ALLOWED_ORIGINS: "http://localhost:5174",
  OWNER_EMAIL: "owner@gmail.com",
  GOOGLE_CLIENT_ID: "123456789-browser-tests.apps.googleusercontent.com",
  MODEL_PROVIDER: "mock",
  CHATGPT_ENABLED: "true",
  NOTION_TOKEN: "synthetic-notion-token-for-browser-tests",
  NOTION_CLIENT_ID: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  NOTION_CLIENT_SECRET: "synthetic-notion-oauth-secret",
  NOTION_TOKEN_KEY: "ab".repeat(32),
});
let imports = 0;
const app = createApp(
  config,
  undefined,
  undefined,
  async (credential) => JSON.parse(credential) as GoogleIdentity,
  async (pageId, token, signal) => {
    if (token.startsWith("synthetic-notion-access-"))
      return personalImporter(pageId, token, signal);
    if (pageId === personalPages.migration)
      return {
        pageId,
        title: "Legacy OAuth migration",
        warnings: [],
        passages: [
          {
            blockId: "99999999-9999-4999-8999-999999999999",
            text: "Legacy migration evidence.",
          },
        ],
      };
    if (pageId !== "11111111-1111-4111-8111-111111111111")
      throw new HttpError(
        403,
        "Notion could not read this page. Check the integration's page access.",
      );
    imports++;
    if (imports >= 3)
      throw new HttpError(
        502,
        "Notion could not refresh the page. Try again manually.",
      );
    return {
      pageId,
      title:
        imports === 1
          ? "Synthetic migration project"
          : "Synthetic migration project updated",
      passages: [
        {
          blockId: "22222222-2222-4222-8222-222222222222",
          text:
            imports === 1
              ? "I proposed a staged database migration with a rollback rehearsal. The team implemented the rollout. No measured revenue outcome was recorded."
              : "I compared queue retries and idempotency keys for the notification service. The team implemented durable delivery.",
        },
      ],
      warnings: ["Skipped unsupported block: image."],
    };
  },
  notionFixture,
  personalSearcher,
  {
    async status() {
      return { kind: "connected", email: "owner@example.com" };
    },
    async models() {
      return [{ id: "synthetic-chatgpt", name: "Synthetic ChatGPT" }];
    },
    async disconnect() {},
    provider() {
      return {
        async *stream(history, tools) {
          if (tools.length)
            throw new Error("Subscription prototype must not receive tools");
          const content = history.at(-1)?.content ?? "";
          const question = content.startsWith("{")
            ? JSON.parse(content).question
            : content;
          yield {
            type: "delta",
            text:
              question === "What is a direct agreement?"
                ? "Do you mean a direct agreement in project finance, or another context?"
                : `Subscription response: ${content}`,
          };
          yield { type: "complete" };
        },
      };
    },
  },
);
app.server.listen(3101, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
