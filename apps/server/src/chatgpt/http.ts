import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModelSelection } from "@panky/shared";
import type { Config } from "../config.js";
import type { Chat } from "../chat/chat.js";
import { HttpError, json, type RequestAccess } from "../http-utils.js";
import type { ChatGPTService } from "./service.js";

export type ChatGPTConnection = Pick<
  ChatGPTService,
  "status" | "models" | "disconnect" | "provider"
> &
  Partial<Pick<ChatGPTService, "close">>;

export class ChatGPTApi {
  constructor(
    private readonly config: Pick<Config, "CHATGPT_ENABLED">,
    private readonly service: ChatGPTConnection,
    private readonly chat: Pick<Chat, "busy">,
  ) {}

  private async models(response: ServerResponse) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once("close", abort);
    if (response.destroyed) controller.abort();
    try {
      return await this.service.models(controller.signal);
    } finally {
      response.off("close", abort);
    }
  }

  async selectProvider(
    selection: ModelSelection,
    response: ServerResponse,
    isOwner: boolean,
    assertAccess: () => void,
  ) {
    if (!isOwner)
      throw new HttpError(
        403,
        "Only the owner can use the ChatGPT subscription prototype.",
      );
    if (!this.config.CHATGPT_ENABLED)
      throw new HttpError(
        409,
        "ChatGPT subscription access is not enabled on this server.",
      );
    const models = await this.models(response);
    assertAccess();
    if (!models.some((model) => model.id === selection.model))
      throw new HttpError(
        400,
        "This ChatGPT model is no longer available. Refresh the model list.",
      );
    return this.service.provider(selection.model);
  }

  async route(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    access: RequestAccess,
  ) {
    if (
      path === "/api/connections/chatgpt" ||
      path === "/api/connections/chatgpt/models"
    ) {
      if (!access.isOwner)
        throw new HttpError(
          403,
          "ChatGPT subscriptions are available only to the owner in this prototype.",
        );
      if (request.method === "GET") {
        const result = path.endsWith("/models")
          ? {
              models: this.config.CHATGPT_ENABLED
                ? await this.models(response)
                : [],
            }
          : this.config.CHATGPT_ENABLED
            ? await this.service.status()
            : { kind: "unavailable" };
        access.assertAccess();
        json(response, 200, result);
      } else if (request.method === "DELETE" && !path.endsWith("/models")) {
        if (this.chat.busy)
          throw new HttpError(
            409,
            "Stop the active response before disconnecting ChatGPT.",
          );
        if (this.config.CHATGPT_ENABLED) await this.service.disconnect();
        response.writeHead(204);
        response.end();
      } else throw new HttpError(405, "Method not allowed.");
      return true;
    }
    return false;
  }
}
