import { ExecutionGate } from "../execution-gate.js";
import type { Evidence, InterviewInput, StreamEvent } from "@panky/shared";
import type { Config } from "../config.js";
import { HttpError } from "../http-utils.js";
import type { ModelProvider } from "../providers/provider.js";
import { interviewContext } from "../interview/prompt.js";
import { sourcedChatContext } from "./sources.js";
import { boundedHistory, runLoop } from "./loop.js";
import { TaskError } from "../task-error.js";
import type { Store } from "./store.js";
import { dateTimeTool, type Tool } from "./tools.js";

export class Chat {
  private active:
    | { controller: AbortController; conversationId: string; runId?: string }
    | undefined;
  private finished: Promise<void> | undefined;
  constructor(
    private readonly store: Store,
    private readonly provider: ModelProvider,
    private readonly config: Config,
    private readonly tools: readonly Tool[] = [dateTimeTool],
    private readonly gate = new ExecutionGate(),
  ) {}
  get busy() {
    return this.gate.busy;
  }
  get activeConversationId() {
    return this.active?.conversationId;
  }
  start(
    conversationId: string,
    content: string,
    send: (event: StreamEvent) => Promise<void>,
    signal: AbortSignal,
    includeActivity = false,
    interview?: InterviewInput,
    sources: Evidence[] = [],
    useSources = false,
    modelProvider?: ModelProvider,
  ): Promise<void> {
    if (this.active)
      throw new HttpError(
        409,
        "Panky is already replying. Wait for the current response to finish.",
      );
    if (!this.store.conversation(conversationId))
      throw new HttpError(404, "Conversation not found.");
    const context = interview
      ? interviewContext(
          content,
          interview,
          this.config.HISTORY_MAX_CHARS,
          sources,
        )
      : useSources
        ? sourcedChatContext(
            this.store.messages(conversationId),
            content,
            this.config.HISTORY_MAX_CHARS,
            sources,
          )
        : undefined;
    const release = this.gate.acquire();
    const controller = new AbortController();
    const active: NonNullable<Chat["active"]> = { controller, conversationId };
    this.active = active;
    const abort = () => controller.abort("interrupted");
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timeout = setTimeout(
      () => controller.abort("timeout"),
      this.config.MAX_TASK_DURATION_MS,
    );
    this.finished = this.respond(
      conversationId,
      content,
      send,
      active,
      includeActivity,
      context,
      Boolean(interview),
      modelProvider,
    ).finally(() => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      release();
      this.active = undefined;
      this.finished = undefined;
    });
    return this.finished;
  }
  async cancel(id: string) {
    const run = this.store.run(id);
    if (!run) throw new HttpError(404, "Task not found.");
    if (run.status === "running" && this.active?.runId === id) {
      this.active.controller.abort("cancelled");
      await this.finished;
    }
    return this.store.run(id);
  }
  async stop() {
    this.active?.controller.abort("interrupted");
    await this.finished;
  }
  private async respond(
    conversationId: string,
    content: string,
    send: (event: StreamEvent) => Promise<void>,
    active: NonNullable<Chat["active"]>,
    includeActivity: boolean,
    suppliedContext?: ReturnType<typeof interviewContext> & {
      omittedMessages?: number;
    },
    isInterview = false,
    modelProvider?: ModelProvider,
  ) {
    const signal = active.controller.signal;
    signal.throwIfAborted();
    const { user, assistant, run } = this.store.beginResponse(
      conversationId,
      content,
      suppliedContext?.sources,
    );
    active.runId = run.id;
    let status: "completed" | "failed" | "cancelled" | "interrupted" =
      "completed";
    let error: string | null = null;
    try {
      await send({ type: "start", user, assistant, run });
      const context = suppliedContext
        ? {
            ...suppliedContext,
            omittedMessages:
              suppliedContext.omittedMessages ??
              this.store
                .messages(conversationId)
                .filter((message) => message.status === "completed").length - 1,
          }
        : boundedHistory(
            this.store.messages(conversationId),
            this.config.HISTORY_MAX_CHARS,
          );
      const activity = async (event: Parameters<Store["addActivity"]>[1]) => {
        const saved = this.store.addActivity(run.id, event);
        if (includeActivity) await send({ type: "activity", activity: saved });
      };
      await activity({
        kind: "run_started",
        historyChars: context.historyChars,
        omittedMessages: context.omittedMessages,
      });
      await runLoop({
        history: context.history,
        provider: modelProvider ?? this.provider,
        purpose: isInterview
          ? "interview"
          : suppliedContext
            ? "sourced-chat"
            : "chat",
        tools: suppliedContext || modelProvider ? [] : this.tools,
        config: this.config,
        signal,
        activity,
        delta: async (text) => {
          assistant.content += text;
          this.store.saveMessage(assistant);
          await send({ type: "delta", text });
        },
      });
      signal.throwIfAborted();
    } catch (caught) {
      status = signal.aborted
        ? signal.reason === "cancelled"
          ? "cancelled"
          : signal.reason === "timeout"
            ? "failed"
            : "interrupted"
        : "failed";
      error =
        status === "cancelled"
          ? "Task cancelled."
          : status === "interrupted"
            ? "The connection closed before this task finished."
            : signal.reason === "timeout"
              ? "The task exceeded its time limit."
              : caught instanceof TaskError
                ? caught.message
                : "The provider could not complete this task.";
    }
    const activity = this.store.finishRun(run, assistant, status, error);
    if (includeActivity) {
      await send({ type: "activity", activity }).catch(() => undefined);
      await send({ type: "done", message: assistant, run }).catch(
        () => undefined,
      );
    } else if (status === "completed") {
      await send({ type: "done", message: assistant, run }).catch(
        () => undefined,
      );
    } else {
      await send({
        type: "error",
        error: error ?? "The response was interrupted.",
      }).catch(() => undefined);
    }
  }
}
