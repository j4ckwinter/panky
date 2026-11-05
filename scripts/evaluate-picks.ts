import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  healthSchema,
  pickAnalysisSchema,
  picksSchema,
  type PickMessage,
} from "@panky/shared";
import { loadConfig } from "../apps/server/src/config.js";
import { createApp } from "../apps/server/src/http.js";

const { values } = parseArgs({
  options: {
    run: { type: "boolean", default: false },
    model: { type: "string", default: "panky-qwen3:4b" },
    endpoint: { type: "string", default: "http://127.0.0.1:11434" },
  },
});

if (!values.run) {
  process.stdout.write(
    "Opt-in Picks evaluation: pnpm evaluate:picks --run [--model panky-qwen3:4b] [--endpoint http://127.0.0.1:11434]\nRun on the Windows Ollama host. Uses an isolated in-memory backend and sample evidence, never the live database. Writes a JSON report to stdout; review answer quality manually.\n",
  );
} else {
  const token = randomBytes(32).toString("hex");
  const config = loadConfig({
    AUTH_TOKEN: token,
    DATABASE_PATH: ":memory:",
    MODEL_PROVIDER: "ollama",
    MODEL_NAME: values.model,
    MODEL_ENDPOINT: values.endpoint,
    MODEL_CONTEXT_LENGTH: "4096",
    HISTORY_MAX_CHARS: "8000",
    MAX_TASK_DURATION_MS: "120000",
  });
  const app = createApp(config);
  const deadline = AbortSignal.timeout(420000);
  const results: Array<{
    name: string;
    passed: boolean;
    durationMs: number;
    messages: PickMessage[];
    note?: string;
  }> = [];
  const report: Record<string, unknown> = {
    evaluatedAt: new Date().toISOString(),
    model: config.MODEL_NAME,
    contextLength: config.MODEL_CONTEXT_LENGTH,
    historyMaxChars: config.HISTORY_MAX_CHARS,
    taskTimeoutMs: config.MAX_TASK_DURATION_MS,
    database: ":memory:",
    qualityReview:
      "pending human review; automatic checks cover execution only",
  };
  try {
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Evaluation server did not bind TCP.");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${origin}/api${path}`, {
        ...init,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.any([
          deadline,
          AbortSignal.timeout(125000),
          ...(init.signal ? [init.signal] : []),
        ]),
      });
      if (!response.ok)
        throw new Error(`Evaluation request failed: HTTP ${response.status}.`);
      return response.json();
    };
    const fixtures = picksSchema.parse(await request("/picks")).fixtures;
    const fixture = fixtures[0];
    const cancellationFixture = fixtures[1];
    if (!fixture || !cancellationFixture)
      throw new Error("Evaluation requires two sample fixtures.");
    report.fixtures = [fixture, cancellationFixture];
    const path = (id: string) => `/picks/${encodeURIComponent(id)}/analysis`;
    const history = async (id: string) =>
      pickAnalysisSchema.parse(await request(path(id))).messages;
    const submit = async (
      name: string,
      question: string,
      expectedTurns: number,
    ) => {
      const started = performance.now();
      const returned = pickAnalysisSchema.parse(
        await request(path(fixture.id), {
          method: "POST",
          body: JSON.stringify({ question }),
        }),
      ).messages;
      const saved = await history(fixture.id);
      const answer = saved.at(-1);
      const passed =
        saved.length === expectedTurns * 2 &&
        answer?.role === "assistant" &&
        answer.status === "completed" &&
        answer.content.trim().length > 0 &&
        JSON.stringify(returned) === JSON.stringify(saved);
      results.push({
        name,
        passed,
        durationMs: Math.round(performance.now() - started),
        messages: saved,
      });
      process.stderr.write(`${name}: ${passed ? "PASS" : "FAIL"}\n`);
      if (!passed)
        throw new Error(`${name} did not complete and persist correctly.`);
    };
    await submit(
      "explanation",
      "Explain the home, draw and away probabilities using only the supplied evidence. What is missing?",
      1,
    );
    await submit(
      "follow_up",
      "Following your previous explanation, which outcome is most likely, and why is it still uncertain? Do not invent new facts.",
      2,
    );

    const controller = new AbortController();
    const started = performance.now();
    let finished = false;
    const pending = request(path(cancellationFixture.id), {
      method: "POST",
      body: JSON.stringify({
        question:
          "Explain this sample prediction in detail. Discuss every supplied fact, the three possible outcomes and all missing evidence.",
      }),
      signal: controller.signal,
    }).finally(() => {
      finished = true;
    });
    const settled = pending.catch(() => undefined);
    let partial: PickMessage | undefined;
    while (!finished && performance.now() - started < 125000) {
      const latest = (await history(cancellationFixture.id)).at(-1);
      if (latest?.status === "running" && latest.content.length > 0) {
        partial = latest;
        break;
      }
      await setTimeout(50, undefined, { signal: deadline });
    }
    controller.abort();
    await settled;
    const abortedAt = performance.now();
    let busy = true;
    while (busy && performance.now() - abortedAt < 10000) {
      busy = healthSchema.parse(await request("/health")).busy;
      if (busy) await setTimeout(50, undefined, { signal: deadline });
    }
    const saved = await history(cancellationFixture.id);
    const answer = saved.at(-1);
    const passed = Boolean(
      partial &&
        !busy &&
        answer?.id === partial.id &&
        answer?.status === "interrupted" &&
        answer.content.startsWith(partial.content) &&
        saved.length === 2,
    );
    results.push({
      name: "cancellation",
      passed,
      durationMs: Math.round(performance.now() - started),
      messages: saved,
      note: partial
        ? "Checks interrupted saved output and release of the shared execution slot."
        : "No partial running output was observed; cancellation is inconclusive, not a pass.",
    });
    process.stderr.write(
      `cancellation: ${passed ? "PASS" : "FAIL / INCONCLUSIVE"}\n`,
    );
  } catch (error) {
    report.failure =
      error instanceof Error ? error.message : "Evaluation failed.";
  } finally {
    await app.close().catch(() => {
      report.shutdownFailure = "Evaluation backend did not close cleanly.";
    });
    const automaticChecksPassed =
      results.length === 3 &&
      results.every((result) => result.passed) &&
      !report.failure &&
      !report.shutdownFailure;
    if (!automaticChecksPassed) process.exitCode = 1;
    process.stdout.write(
      JSON.stringify({ ...report, automaticChecksPassed, results }, null, 2) +
        "\n",
    );
  }
}
