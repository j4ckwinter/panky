import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Message } from "@panky/shared";
import { MockProvider } from "./provider.js";

test("maximum-length prompts stream in bounded chunks without losing Unicode or whitespace", async () => {
  const content = `${"a\n".repeat(3998)}🍋🙂`;
  assert.equal(content.length, 8000);
  const message: Message = {
    id: randomUUID(),
    conversationId: randomUUID(),
    role: "user",
    content,
    status: "completed",
    createdAt: new Date().toISOString(),
  };
  const chunks: string[] = [];
  for await (const chunk of new MockProvider(0).stream(
    [message],
    new AbortController().signal,
  )) {
    assert.equal(Buffer.from(chunk, "utf8").toString("utf8"), chunk);
    chunks.push(chunk);
  }
  assert(
    chunks.length <= 350,
    "Maximum prompt must finish within 350 mock delays (12.25s at the default delay).",
  );
  assert(chunks.join("").includes(`You said: “${content}”\n\n`));
  assert(chunks.join("").endsWith("no AI model or tools were used."));
});
