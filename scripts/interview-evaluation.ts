import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  conversationSchema,
  interviewInputSchema,
  streamEventSchema,
} from "@panky/shared";
import { loadConfig } from "../apps/server/src/config.js";
import { createApp } from "../apps/server/src/http.js";
import { interviewCases, interviewSequences } from "./interview-cases.js";

const cases = [
  ...interviewCases.map((test) => ({
    ...test,
    sequenceId: test.id,
    turn: 1,
    context: [] as Array<{ question: string; spokenAnswer: string }>,
  })),
  ...interviewSequences.flatMap((sequence) =>
    sequence.turns.map((test, index) => ({
      id: `${sequence.id}-${index + 1}`,
      category: sequence.category,
      question: test.question,
      review: test.review,
      sequenceId: sequence.id,
      turn: index + 1,
      context: sequence.turns
        .slice(Math.max(0, index - 4), index)
        .map((prior) => ({
          question: prior.question,
          spokenAnswer: prior.spokenAnswer,
        })),
    })),
  ),
];
for (const test of cases)
  interviewInputSchema.parse({ experience: "", context: test.context });

const { values } = parseArgs({
  options: {
    run: { type: "boolean", default: false },
    model: { type: "string", default: "panky-qwen3:4b" },
    endpoint: { type: "string", default: "http://127.0.0.1:11434" },
    "experience-file": { type: "string" },
  },
});

if (!values.run) {
  process.stdout.write(
    `Interview evaluation: ${cases.length} turns (${interviewCases.length} standalone cases and ${interviewSequences.length} three-turn sequences), input schemas validated; no model calls made.\nRun on the PC: pnpm evaluate:interview --run --experience-file /path/to/private-sample.txt\nOptional: --model panky-qwen3:4b --endpoint http://127.0.0.1:11434\nUses an in-memory database. JSON on stdout includes generated personal content; save it privately. See docs/interview-evaluation.md.\n`,
  );
} else {
  const file = values["experience-file"];
  if (!file) throw new Error("--experience-file is required with --run.");
  if ((await stat(file)).size > 16000)
    throw new Error("Experience file exceeds the 16 KB input limit.");
  const experience = (await readFile(file, "utf8")).trim();
  if (!experience || experience.length > 4000)
    throw new Error("Experience sample must contain 1–4000 characters.");
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
  const results: Array<Record<string, unknown>> = [];
  let failure: string | null = null;
  const deadline = AbortSignal.timeout(cases.length * 125000 + 30000);
  const conversations = new Map<string, string>();
  try {
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Evaluation server did not bind TCP.");
    const request = (path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([deadline, AbortSignal.timeout(125000)]),
      });
    for (const test of cases) {
      let id = conversations.get(test.sequenceId);
      if (!id) {
        const created = await request("/api/conversations");
        if (!created.ok)
          throw new Error(
            `Conversation creation failed: HTTP ${created.status}`,
          );
        id = conversationSchema.parse(await created.json()).id;
        conversations.set(test.sequenceId, id);
      }
      const started = performance.now();
      let firstDeltaMs: number | null = null;
      let firstCompleteCueMs: number | null = null;
      let output = "";
      let status = "missing_terminal";
      let taskError: string | null = null;
      let admittedContextChars: number | null = null;
      let sourceCount = 0;
      const response = await request(`/api/conversations/${id}/messages`, {
        content: test.question,
        interview: { experience, context: test.context },
        includeActivity: true,
      });
      if (!response.ok || !response.body)
        throw new Error(`Submission failed: HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffer = "";
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) {
            buffer += decoder.decode();
            break;
          }
          bytes += part.value.byteLength;
          if (bytes > 1048576) throw new Error("Evaluation stream too large.");
          buffer += decoder.decode(part.value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (!frame.startsWith("data: "))
              throw new Error("Invalid SSE frame.");
            const event = streamEventSchema.parse(JSON.parse(frame.slice(6)));
            const elapsed = Math.round(performance.now() - started);
            if (event.type === "start")
              sourceCount = event.assistant.sources.length;
            if (
              event.type === "activity" &&
              event.activity.kind === "run_started"
            )
              admittedContextChars = event.activity.historyChars;
            if (event.type === "delta") {
              firstDeltaMs ??= elapsed;
              output += event.text;
              if (
                firstCompleteCueMs === null &&
                /## Immediate cues\s*\r?\n[-*] .+\r?\n/.test(output)
              )
                firstCompleteCueMs = elapsed;
            }
            if (event.type === "done") {
              status = event.run.status;
              taskError = event.run.error;
            }
            if (event.type === "error") taskError = event.error;
          }
        }
        if (buffer.trim()) throw new Error("Incomplete SSE frame.");
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const durationMs = Math.round(performance.now() - started);
      const transportPassed = status === "completed" && !taskError;
      if (!transportPassed) process.exitCode = 1;
      results.push({
        ...test,
        transportPassed,
        status,
        taskError,
        firstDeltaMs,
        firstCompleteCueMs,
        durationMs,
        admittedContextChars,
        sourceCount,
        output,
        reviewStatus: "pending-human-review",
        scores: {
          correctness: null,
          relevantExperience: null,
          factualSupport: null,
          readability: null,
          missingInformation: null,
        },
        unsupportedPersonalClaims: null,
        usefulCueConfirmed: null,
        confusedSuggestionWithSpokenAnswer: null,
        executableExampleCheck: {
          status: "not-reviewed",
          command: "",
          result: "",
        },
        reviewerNotes: "",
      });
      process.stderr.write(`${test.id}: ${status}, ${durationMs} ms\n`);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "Evaluation failed.";
    process.exitCode = 1;
  } finally {
    await app.close();
    process.stdout.write(
      JSON.stringify(
        {
          evaluatedAt: new Date().toISOString(),
          model: config.MODEL_NAME,
          contextLength: config.MODEL_CONTEXT_LENGTH,
          historyMaxChars: config.HISTORY_MAX_CHARS,
          taskTimeoutMs: config.MAX_TASK_DURATION_MS,
          database: ":memory:",
          expectedCases: cases.length,
          sequences: interviewSequences.length,
          contextPolicy:
            "Up to four prior questions and scripted user-confirmed spoken summaries; generated outputs are never forwarded.",
          limitations: [
            "No imported Notion corpus: source retrieval and ranking latency require a separate live-corpus evaluation.",
            "Scripted spoken summaries do not validate human transcription or live interview usability.",
            "No GPU memory or model digest measurement is automated; record them with the run conditions.",
            "Code examples are not executed automatically; review and run suitable examples in an isolated environment.",
          ],
          runConditions: {
            gpu: null,
            peakGpuMemoryMiB: null,
            ollamaVersion: null,
            modelDigest: null,
            sampleRevision: null,
          },
          failure,
          acceptance: "pending-human-review-and-agreed-targets",
          results,
        },
        null,
        2,
      ) + "\n",
    );
  }
}
