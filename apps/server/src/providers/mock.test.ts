import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Message } from "@panky/shared";
import { MockProvider } from "./mock.js";
import { sourcedChatContext } from "../chat/sources.js";
import { dateTimeTool } from "../chat/tools.js";
import type { ContextMessage, ProviderEvent } from "./provider.js";

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

test("sourced chat demos echo only the question and never call unavailable tools", async () => {
  for (const question of [
    "Explain migration.",
    "What is the current date and time?",
  ]) {
    const context = sourcedChatContext([], question, 8000, [
      {
        sourceId: randomUUID(),
        pageId: randomUUID(),
        blockId: randomUUID(),
        title: "Private migration",
        url: "https://www.notion.so/example",
        excerpt: "Private passage contents.",
        importedAt: new Date().toISOString(),
      },
    ]);
    const events: ProviderEvent[] = [];
    for await (const event of new MockProvider(0).stream(
      context.history,
      [],
      new AbortController().signal,
      "sourced-chat",
    ))
      events.push(event);
    const reply = events
      .filter((event) => event.type === "delta")
      .map((event) => event.text)
      .join("");
    assert(reply.includes(`You said: “${question}”`));
    assert(!reply.includes("Private migration"));
    assert(!reply.includes("Private passage contents"));
    assert(!reply.includes('"sources"'));
    assert(!events.some((event) => event.type === "tool_call"));
    assert.equal(events.at(-1)?.type, "complete");
  }
});

test("ordinary JSON chat stays literal and the permitted date-time demo still executes", async () => {
  const literal = JSON.stringify({
    question: "An ordinary JSON message",
    sources: [],
  });
  let reply = "";
  for await (const event of new MockProvider(0).stream(
    [{ role: "user", content: literal }],
    [],
    new AbortController().signal,
    "chat",
  )) {
    if (event.type === "delta") reply += event.text;
  }
  assert(reply.includes(`You said: “${literal}”`));
  const history: ContextMessage[] = [
    { role: "user", content: "What is the current date and time?" },
  ];
  const events: ProviderEvent[] = [];
  for await (const event of new MockProvider(0).stream(
    history,
    [dateTimeTool.definition],
    new AbortController().signal,
  ))
    events.push(event);
  assert.deepEqual(events, [
    {
      type: "tool_call",
      callId: "current-datetime",
      name: "get_current_datetime",
      arguments: {},
    },
  ]);
  history.push({
    role: "tool",
    content: "2026-11-03T12:00:00Z",
    name: "get_current_datetime",
    callId: "current-datetime",
  });
  reply = "";
  for await (const event of new MockProvider(0).stream(
    history,
    [dateTimeTool.definition],
    new AbortController().signal,
  )) {
    if (event.type === "delta") reply += event.text;
  }
  assert(reply.includes("2026-11-03T12:00:00Z"));
});
