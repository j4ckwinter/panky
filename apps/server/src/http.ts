import { createHash, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { type StreamEvent, submissionSchema } from "@panky/shared";
import { z } from "zod";
import { Chat, HttpError } from "./chat.js";
import type { Config } from "./config.js";
import { MockProvider, type ModelProvider } from "./provider.js";
import { Store } from "./store.js";

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

async function readSubmission(request: IncomingMessage) {
  if (
    request.headers["content-type"]?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new HttpError(415, "Use application/json.");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    length += bytes.length;
    if (length > 65536) throw new HttpError(413, "Message body is too large.");
    chunks.push(bytes);
  }
  let input: unknown;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  const result = submissionSchema.safeParse(input);
  if (!result.success)
    throw new HttpError(
      400,
      "Message must contain 1–8000 characters and only a content field.",
    );
  return result.data;
}

export function createApp(
  config: Config,
  provider: ModelProvider = new MockProvider(),
) {
  const store = new Store(config.DATABASE_PATH);
  const chat = new Chat(store, provider);
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
        !["GET", "POST"].includes(method) ||
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
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, ngrok-skip-browser-warning",
        "Access-Control-Max-Age": "600",
      });
      response.end();
      return;
    }
    const suppliedToken = createHash("sha256")
      .update(request.headers.authorization ?? "")
      .digest();
    if (!timingSafeEqual(suppliedToken, expectedToken)) {
      response.setHeader("WWW-Authenticate", "Bearer");
      throw new HttpError(
        401,
        "Authentication required. Enter your backend access token.",
      );
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.search)
      throw new HttpError(400, "Query parameters are not supported.");
    if (url.pathname === "/api/health" && request.method === "GET") {
      json(response, 200, {
        provider: "mock",
        model: config.MODEL_NAME,
        busy: chat.busy,
      });
      return;
    }
    if (url.pathname === "/api/conversations") {
      if (request.method === "GET") json(response, 200, store.conversations());
      else if (request.method === "POST")
        json(response, 201, store.createConversation());
      else throw new HttpError(405, "Method not allowed.");
      return;
    }
    const match = /^\/api\/conversations\/([^/]+)(\/messages)?$/.exec(
      url.pathname,
    );
    if (!match) throw new HttpError(404, "Endpoint not found.");
    const id = z.uuid().safeParse(match[1]);
    if (!id.success) throw new HttpError(400, "Invalid conversation ID.");
    const conversation = store.conversation(id.data);
    if (!conversation) throw new HttpError(404, "Conversation not found.");
    if (!match[2] && request.method === "GET") {
      json(response, 200, { conversation, messages: store.messages(id.data) });
      return;
    }
    if (match[2] && request.method === "POST") {
      const { content } = await readSubmission(request);
      const controller = new AbortController();
      const disconnect = () => controller.abort();
      response.once("close", disconnect);
      if (response.destroyed) controller.abort();
      const send = async (event: StreamEvent) => {
        controller.signal.throwIfAborted();
        if (!response.headersSent)
          response.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Accel-Buffering": "no",
          });
        if (!response.write(`data: ${JSON.stringify(event)}\n\n`))
          await once(response, "drain", { signal: controller.signal });
      };
      try {
        await chat.start(id.data, content, send, controller.signal);
        response.end();
      } finally {
        response.off("close", disconnect);
      }
      return;
    }
    throw new HttpError(405, "Method not allowed.");
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
    async close() {
      await chat.stop();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      store.close();
    },
  };
}
