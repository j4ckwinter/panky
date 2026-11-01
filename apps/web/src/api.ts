import {
  cancelResponseSchema,
  conversationSchema,
  conversationsSchema,
  errorSchema,
  healthSchema,
  historySchema,
  type StreamEvent,
  streamEventSchema,
} from "@panky/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function backendUrl() {
  const url = new URL(import.meta.env.VITE_API_URL || "http://localhost:3001");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "VITE_API_URL must be an HTTPS origin (HTTP is allowed on localhost), without credentials, paths or query strings.",
    );
  }
  return url.origin;
}

export const sessionExpiredEvent = "panky:session-expired";

export function createApi(token?: string) {
  const base = token ? backendUrl() : "";
  const hostname = new URL(base || window.location.origin).hostname;
  const ngrok = [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.app"].some(
    (suffix) => hostname.endsWith(suffix),
  );
  async function request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(`${base}/api${path}`, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(15_000),
        credentials: token ? "omit" : "same-origin",
        redirect: "error",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(!token || ngrok ? { "ngrok-skip-browser-warning": "1" } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new Error(
        "Could not reach Panky. Check that the backend and tunnel are running, then refresh history. Messages are never sent again automatically.",
      );
    }
    if (!response.ok) {
      if (response.status === 401 && !token)
        window.dispatchEvent(new Event(sessionExpiredEvent));
      const parsed = errorSchema.safeParse(
        await response.json().catch(() => null),
      );
      const message =
        response.status === 401
          ? token
            ? "Access token rejected. Disconnect and connect with the current token."
            : "Your session has ended. Sign in again."
          : parsed.success
            ? parsed.data.error
            : `Request failed (${response.status}).`;
      throw new ApiError(message, response.status);
    }
    return response;
  }
  return {
    async health() {
      return healthSchema.parse(await (await request("/health")).json());
    },
    async conversations() {
      return conversationsSchema.parse(
        await (await request("/conversations")).json(),
      );
    },
    async create() {
      return conversationSchema.parse(
        await (await request("/conversations", { method: "POST" })).json(),
      );
    },
    async rename(id: string, title: string) {
      return conversationSchema.parse(
        await (
          await request(`/conversations/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          })
        ).json(),
      );
    },
    async remove(id: string) {
      await request(`/conversations/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async history(id: string) {
      return historySchema.parse(
        await (
          await request(`/conversations/${encodeURIComponent(id)}`)
        ).json(),
      );
    },
    async cancel(id: string) {
      return cancelResponseSchema.parse(
        await (
          await request(`/runs/${encodeURIComponent(id)}/cancel`, {
            method: "POST",
          })
        ).json(),
      );
    },
    async send(
      id: string,
      content: string,
      signal: AbortSignal,
      onEvent: (event: StreamEvent) => void,
    ) {
      const response = await request(
        `/conversations/${encodeURIComponent(id)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ content, includeActivity: true }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
        },
      );
      if (
        !response.headers.get("content-type")?.includes("text/event-stream") ||
        !response.body
      ) {
        throw new Error(
          "The backend did not return a message stream. Refresh history before sending again.",
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      try {
        while (true) {
          const chunk = await reader.read().catch(() => {
            throw new Error(
              "The connection stopped during the reply. Refresh history to see what was saved. Your message will not be sent again automatically.",
            );
          });
          if (chunk.done) break;
          buffer += decoder
            .decode(chunk.value, { stream: true })
            .replace(/\r\n/g, "\n");
          let end = buffer.indexOf("\n\n");
          while (end >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) {
              const event = streamEventSchema.parse(JSON.parse(data));
              if (event.type === "error") throw new Error(event.error);
              onEvent(event);
              if (event.type === "done") completed = true;
            }
            end = buffer.indexOf("\n\n");
          }
        }
        if (!completed)
          throw new Error(
            "The reply was interrupted. Refresh history to see what was saved. Your message will not be sent again automatically.",
          );
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
  };
}
export type Api = ReturnType<typeof createApi>;
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Refresh history to check the saved conversation.";
}
