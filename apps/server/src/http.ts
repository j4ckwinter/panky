import { ExecutionGate } from "./execution-gate.js";
import { PicksStore } from "./picks/store.js";
import { PicksService } from "./picks/service.js";
import { PicksApi } from "./picks/http.js";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { ChatApi } from "./chat/http.js";
import { ChatGPTApi, type ChatGPTConnection } from "./chatgpt/http.js";
import { ChatGPTService } from "./chatgpt/service.js";
import { Auth } from "./auth/auth.js";
import type { GoogleVerifier } from "./auth/google.js";
import { Chat } from "./chat/chat.js";
import { Store } from "./chat/store.js";
import type { Tool } from "./chat/tools.js";
import type { Config } from "./config.js";
import { HttpError, json } from "./http-utils.js";
import { OllamaProvider } from "./providers/ollama.js";
import { type ModelProvider } from "./providers/provider.js";
import { MockProvider } from "./providers/mock.js";
import { ExperienceStore } from "./experience/store.js";
import { ExperienceApi } from "./experience/http.js";
import { importNotionPage } from "./experience/notion.js";
import { ConnectionsApi } from "./connections/http.js";
import type { NotionOAuth } from "./connections/notion.js";
import { searchNotionPages } from "./connections/pages.js";

export function createApp(
  config: Config,
  provider: ModelProvider = config.MODEL_PROVIDER === "ollama"
    ? new OllamaProvider({
        endpoint: config.MODEL_ENDPOINT,
        model: config.MODEL_NAME,
        contextLength: config.MODEL_CONTEXT_LENGTH,
      })
    : new MockProvider(),
  tools?: readonly Tool[],
  googleVerifier?: GoogleVerifier,
  notionImporter: typeof importNotionPage = importNotionPage,
  notionOAuth?: NotionOAuth,
  notionSearcher: typeof searchNotionPages = searchNotionPages,
  chatGPT: ChatGPTConnection = new ChatGPTService({
    enabled: config.CHATGPT_ENABLED,
    credentialPath: config.CHATGPT_CREDENTIAL_PATH,
  }),
) {
  const store = new Store(config.DATABASE_PATH);
  const auth = new Auth(config, googleVerifier);
  const experience = new ExperienceStore(
    config.DATABASE_PATH,
    (userId): string | null => connections.eligibleConnection(userId),
  );
  const connections = new ConnectionsApi(
    config,
    auth,
    experience,
    notionOAuth,
    notionImporter,
    notionSearcher,
    (userId): boolean => experienceApi.busy(userId),
  );
  const gate = new ExecutionGate();
  const chat = new Chat(store, provider, config, tools, gate);
  const picksStore = new PicksStore(config.DATABASE_PATH);
  const picksService = new PicksService(picksStore, provider, config, gate);
  const picksApi = new PicksApi(picksStore, picksService);
  const experienceApi = new ExperienceApi(
    experience,
    config.NOTION_TOKEN,
    notionImporter,
    (userId): boolean => connections.busy(userId),
  );
  const chatGPTApi = new ChatGPTApi(config, chatGPT, chat);
  const chatApi = new ChatApi(store, chat, experience, chatGPTApi);
  const expectedToken = createHash("sha256")
    .update(`Bearer ${config.AUTH_TOKEN}`)
    .digest();

  async function route(request: IncomingMessage, response: ServerResponse) {
    response.setHeader("Cache-Control", "no-store, no-transform");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Vary", "Origin");
    const origin = request.headers.origin;
    if (origin && !config.ALLOWED_ORIGINS.includes(origin))
      throw new HttpError(403, "Origin is not allowed.");
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      if (!origin)
        throw new HttpError(403, "Origin is required for preflight.");
      const method = request.headers["access-control-request-method"];
      const headers = request.headers["access-control-request-headers"];
      if (
        !method ||
        !["GET", "POST", "PATCH", "DELETE"].includes(method) ||
        headers
          ?.split(",")
          .some(
            (header) =>
              ![
                "authorization",
                "content-type",
                "ngrok-skip-browser-warning",
              ].includes(header.trim().toLowerCase()),
          )
      ) {
        throw new HttpError(403, "Preflight request is not allowed.");
      }
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, ngrok-skip-browser-warning",
        "Access-Control-Max-Age": "600",
      });
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    if (await connections.route(request, response, url)) return;
    if (url.search)
      throw new HttpError(400, "Query parameters are not supported.");
    if (await auth.route(request, response, url.pathname)) return;
    const suppliedToken = createHash("sha256")
      .update(request.headers.authorization ?? "")
      .digest();
    const bearer = timingSafeEqual(suppliedToken, expectedToken);
    const user = bearer ? null : auth.authenticate(request);
    const userId = bearer ? "owner" : user?.id;
    if (!userId) {
      response.setHeader("WWW-Authenticate", "Bearer");
      throw new HttpError(401, "Sign in to continue.");
    }
    const assertAccess = () => {
      if (!bearer && auth.authenticate(request)?.id !== userId)
        throw new HttpError(401, "Sign in to continue.");
    };
    if (
      await experienceApi.route(
        request,
        response,
        url.pathname,
        userId,
        assertAccess,
      )
    )
      return;
    const access = {
      userId,
      isOwner: bearer || user?.role === "owner",
      assertAccess,
    };
    if (await chatGPTApi.route(request, response, url.pathname, access)) return;
    assertAccess();
    if (url.pathname === "/api/health" && request.method === "GET") {
      json(response, 200, {
        provider: config.MODEL_PROVIDER,
        model: config.MODEL_NAME,
        busy: chat.busy,
      });
      return;
    }
    if (await picksApi.route(request, response, url.pathname, access)) return;
    if (await chatApi.route(request, response, url.pathname, access)) return;
    throw new HttpError(404, "Endpoint not found.");
  }

  const server = createServer((request, response) => {
    void route(request, response).catch((error: unknown) => {
      if (response.destroyed) return;
      if (response.headersSent) {
        response.end();
        return;
      }
      const status = error instanceof HttpError ? error.status : 500;
      const message =
        error instanceof HttpError
          ? error.message
          : "The backend could not complete the request.";
      json(response, status, { error: message });
    });
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;

  return {
    server,
    store,
    chat,
    experience,
    picksStore,
    async close() {
      await connections.close();
      await experienceApi.stop();
      await picksService.stop();
      await chat.stop();
      chatGPT.close?.();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      auth.close();
      store.close();
      picksStore.close();
      experience.close();
    },
  };
}
