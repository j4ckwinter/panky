import type { PickFixture } from "@panky/shared";
import type { Config } from "../config.js";
import type { ExecutionGate } from "../execution-gate.js";
import type { ModelProvider } from "../providers/provider.js";
import { runLoop } from "../chat/loop.js";
import { picksContext } from "./prompt.js";
import type { PicksStore } from "./store.js";

export class PicksService {
  private controller: AbortController | undefined;
  private finished: Promise<void> | undefined;
  constructor(
    private readonly store: PicksStore,
    private readonly provider: ModelProvider,
    private readonly config: Config,
    private readonly gate: ExecutionGate,
  ) {}
  async stop() {
    this.controller?.abort();
    await this.finished;
  }
  async explain(
    ownerId: string,
    fixture: PickFixture,
    question: string,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const history = picksContext(
      fixture,
      this.store.messages(ownerId, fixture.id),
      question,
      this.config.HISTORY_MAX_CHARS,
    );
    const release = this.gate.acquire();
    const controller = new AbortController();
    this.controller = controller;
    const abort = () => controller.abort("interrupted");
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timeout = setTimeout(
      () => controller.abort("timeout"),
      this.config.MAX_TASK_DURATION_MS,
    );
    try {
      const assistant = this.store.begin(ownerId, fixture, question);
      this.finished = (async () => {
        try {
          await runLoop({
            history,
            provider: this.provider,
            purpose: "picks",
            tools: [],
            config: this.config,
            signal: controller.signal,
            activity: async () => {},
            delta: async (text) => {
              assistant.content += text;
              this.store.save(assistant);
            },
          });
          controller.signal.throwIfAborted();
          assistant.status = "completed";
        } catch {
          assistant.status =
            controller.signal.aborted && controller.signal.reason !== "timeout"
              ? "interrupted"
              : "failed";
        } finally {
          this.store.save(assistant);
        }
      })();
      await this.finished;
      return { messages: this.store.messages(ownerId, fixture.id) };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      this.controller = undefined;
      this.finished = undefined;
      release();
    }
  }
}
