import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  renameConversationSchema,
  type StreamEvent,
  submissionSchema,
} from "@panky/shared";
import { z } from "zod";
import type { ChatGPTApi } from "../chatgpt/http.js";
import type { ExperienceStore } from "../experience/store.js";
import {
  HttpError,
  json,
  readJson,
  type RequestAccess,
} from "../http-utils.js";
import { interviewRetrievalQuery } from "../interview/retrieval.js";
import type { Chat } from "./chat.js";
import type { Store } from "./store.js";

async function readSubmission(request: IncomingMessage) {
  const result = submissionSchema.safeParse(await readJson(request));
  if (!result.success)
    throw new HttpError(
      400,
      "Message must contain 1–8000 characters, an optional includeActivity boolean and optional interview experience of up to 4000 characters and up to four context turns (8000-character questions and 2000-character spoken summaries).",
    );
  return result.data;
}

export class ChatApi {
  constructor(
    private readonly store: Store,
    private readonly chat: Chat,
    private readonly experience: ExperienceStore,
    private readonly chatGPT: ChatGPTApi,
  ) {}

  async route(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    access: RequestAccess,
  ) {
    const { store, chat, experience, chatGPT } = this;
    const { userId, assertAccess } = access;
    if (path === "/api/conversations") {
      if (request.method === "GET")
        json(response, 200, store.conversations(userId));
      else if (request.method === "POST")
        json(response, 201, store.createConversation(userId));
      else throw new HttpError(405, "Method not allowed.");
      return true;
    }
    const cancellation = /^\/api\/runs\/([^/]+)\/cancel$/.exec(path);
    if (cancellation) {
      if (request.method !== "POST")
        throw new HttpError(405, "Method not allowed.");
      const runId = z.uuid().safeParse(cancellation[1]);
      if (!runId.success) throw new HttpError(400, "Invalid task ID.");
      const run = store.run(runId.data);
      if (!run || !store.ownsConversation(run.conversationId, userId))
        throw new HttpError(404, "Task not found.");
      json(response, 200, { run: await chat.cancel(runId.data) });
      return true;
    }
    const match = /^\/api\/conversations\/([^/]+)(\/messages)?$/.exec(path);
    if (!match) return false;
    const id = z.uuid().safeParse(match[1]);
    if (!id.success) throw new HttpError(400, "Invalid conversation ID.");
    if (!store.ownsConversation(id.data, userId))
      throw new HttpError(404, "Conversation not found.");
    const conversation = store.conversation(id.data);
    if (!conversation) throw new HttpError(404, "Conversation not found.");
    if (!match[2] && request.method === "GET") {
      json(response, 200, {
        conversation,
        messages: store.messages(id.data),
        runs: store.runs(id.data),
        activities: store.activities(id.data),
      });
      return true;
    }
    if (
      !match[2] &&
      (request.method === "PATCH" || request.method === "DELETE")
    ) {
      let title: string | undefined;
      if (request.method === "PATCH") {
        const result = renameConversationSchema.safeParse(
          await readJson(request),
        );
        assertAccess();
        if (!result.success)
          throw new HttpError(400, "Title must contain 1–120 characters.");
        title = result.data.title;
      }
      if (!store.ownsConversation(id.data, userId))
        throw new HttpError(404, "Conversation not found.");
      if (chat.activeConversationId === id.data)
        throw new HttpError(
          409,
          "Wait for this conversation's response to finish.",
        );
      if (title !== undefined) {
        json(response, 200, store.renameConversation(id.data, title));
      } else {
        store.deleteConversation(id.data);
        response.writeHead(204);
        response.end();
      }
      return true;
    }
    if (match[2] && request.method === "POST") {
      const {
        content,
        includeActivity,
        interview,
        useSources,
        modelSelection,
      } = await readSubmission(request);
      assertAccess();
      if (!store.ownsConversation(id.data, userId))
        throw new HttpError(404, "Conversation not found.");
      const modelProvider = modelSelection
        ? await chatGPT.selectProvider(
            modelSelection,
            response,
            access.isOwner,
            () => {
              assertAccess();
              if (!store.ownsConversation(id.data, userId))
                throw new HttpError(404, "Conversation not found.");
            },
          )
        : undefined;
      if (modelSelection) {
        assertAccess();
        if (!store.ownsConversation(id.data, userId))
          throw new HttpError(404, "Conversation not found.");
      }
      const useChatSources =
        !interview && useSources && experience.status(userId).usableCount > 0;
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
        await chat.start(
          id.data,
          content,
          send,
          controller.signal,
          includeActivity,
          interview,
          (
            interview
              ? interview.useExperience && interview.useSources
              : useChatSources
          )
            ? experience.search(
                userId,
                interview
                  ? interviewRetrievalQuery(content, interview)
                  : content,
              )
            : [],
          useChatSources,
          modelProvider,
        );
        response.end();
      } finally {
        response.off("close", disconnect);
      }
      return true;
    }
    throw new HttpError(405, "Method not allowed.");
  }
}
