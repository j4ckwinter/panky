import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Message } from "@panky/shared";
import { MockProvider } from "./mock.js";

test("maximum-length prompts stream in bounded chunks without losing Unicode or whitespace", async () => {
  const content = `${"a\n".repeat(3998)}🍋🙂`;
  assert.equal(content.length, 8000);
  const message: Message = {
    id: randomUUID(),
    conversationId: randomUUID(),
    role: "user",
    sources: [],
    content,
    status: "completed",
    createdAt: new Date().toISOString(),
  };
  const chunks: string[] = [];
  for await (const chunk of new MockProvider(0).stream(
    [message],
    [],
    new AbortController().signal,
  )) {
    if (chunk.type !== "delta") continue;
    assert.equal(Buffer.from(chunk.text, "utf8").toString("utf8"), chunk.text);
    chunks.push(chunk.text);
  }
  assert(
    chunks.length <= 350,
    "Maximum prompt must finish within 350 mock delays (12.25s at the default delay).",
  );
  assert(chunks.join("").includes(`You said: “${content}”\n\n`));
  assert(chunks.join("").endsWith("no AI model or tools were used."));
});

test("demo routing uses request purpose independently of prompt wording", async () => {
  const history = [
    {
      role: "system" as const,
      content: "An independently revised system prompt.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({ question: "Explain an API." }),
    },
  ];
  for (const purpose of ["chat", "interview"] as const) {
    let reply = "";
    for await (const event of new MockProvider(0).stream(
      history,
      [],
      new AbortController().signal,
      purpose,
    )) {
      if (event.type === "delta") reply += event.text;
    }
    assert.equal(
      reply.includes("deterministic synthetic demo"),
      purpose === "interview",
    );
    assert.equal(reply.includes("You said:"), purpose === "chat");
  }
});
