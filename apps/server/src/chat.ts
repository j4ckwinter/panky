import type { StreamEvent } from "@panky/shared";
import type { ModelProvider } from "./provider.js";
import type { Store } from "./store.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Chat {
  private active: AbortController | undefined;
  private finished: Promise<void> | undefined;

  constructor(
    private readonly store: Store,
    private readonly provider: ModelProvider,
  ) {}

  get busy() {
    return this.active !== undefined;
  }

  start(
    conversationId: string,
    content: string,
    send: (event: StreamEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.active)
      throw new HttpError(
        409,
        "Panky is already replying. Wait for the current response to finish.",
      );
    if (!this.store.conversation(conversationId))
      throw new HttpError(404, "Conversation not found.");
    const controller = new AbortController();
    this.active = controller;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    this.finished = this.respond(
      conversationId,
      content,
      send,
      controller.signal,
    ).finally(() => {
      signal.removeEventListener("abort", abort);
      this.active = undefined;
      this.finished = undefined;
    });
    return this.finished;
  }

  async stop() {
    this.active?.abort();
    await this.finished;
  }

  private async respond(
    conversationId: string,
    content: string,
    send: (event: StreamEvent) => Promise<void>,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const { user, assistant } = this.store.beginResponse(
      conversationId,
      content,
    );
    try {
      await send({ type: "start", user, assistant });
      for await (const text of this.provider.stream(
        this.store.messages(conversationId),
        signal,
      )) {
        signal.throwIfAborted();
        assistant.content += text;
        this.store.saveMessage(assistant);
        await send({ type: "delta", text });
      }
      signal.throwIfAborted();
      assistant.status = "completed";
      this.store.saveMessage(assistant);
      await send({ type: "done", message: assistant });
    } catch (error) {
      if (assistant.status !== "completed") {
        assistant.status = "interrupted";
        this.store.saveMessage(assistant);
      }
      if (!signal.aborted) {
        await send({
          type: "error",
          error:
            "The response was interrupted. Refresh history to see saved messages; nothing will be resent automatically.",
        }).catch(() => undefined);
      }
      if (error instanceof HttpError) throw error;
    }
  }
}
