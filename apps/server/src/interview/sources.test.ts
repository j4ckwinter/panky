import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  conversationSchema,
  experienceSourceSchema,
  experienceStatusSchema,
  historySchema,
  type InterviewInput,
} from "@panky/shared";
import { fixture, tokens } from "../connections/test-support.js";
import { NotionAuthorizationError } from "../connections/notion.js";
import type { ContextMessage } from "../providers/provider.js";
import { interviewContext } from "./prompt.js";

const sharedPage = "11111111-1111-4111-8111-111111111111";
function page(id: string, title: string) {
  return {
    pageId: id,
    title,
    passages: [
      {
        blockId: randomUUID(),
        text: `${title}: I led the database migration and rollback rehearsal.`,
      },
    ],
    warnings: [],
  };
}

test("typed source selection reaches model inputs and persisted evidence with account and eligibility isolation", async (t) => {
  const histories: (readonly ContextMessage[])[] = [];
  let account = 0;
  let revoked = false;
  const app = await fixture(
    t,
    {
      exchange: async () => ({
        ...tokens,
        access_token: `account-${++account}`,
      }),
      check: async () => {
        if (revoked) throw new NotionAuthorizationError();
      },
      refresh: async () => {
        throw new NotionAuthorizationError();
      },
    },
    true,
    {
      importer: async (id, token) =>
        page(id, token === "account-1" ? "Owner secret" : "Friend secret"),
      model: {
        async *stream(history) {
          histories.push(history);
          yield {
            type: "delta",
            text: "Suggested approach: rehearse the migration.",
          };
          yield { type: "complete" };
        },
      },
    },
  );
  await app.connect();
  await app.connect(app.friend);
  const ownerSource = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: sharedPage })).json(),
  );
  const friendSource = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: sharedPage }, app.friend)).json(),
  );
  const legacy = app
    .experience()
    .replace("owner", page(randomUUID(), "Owner legacy"));
  const failed = app
    .experience()
    .replace(
      "owner",
      page(randomUUID(), "Failed secret"),
      ownerSource.connectionId,
    );
  app.experience().fail("owner", failed.id, "Refresh failed");
  app
    .experience()
    .replace(
      "owner",
      { ...page(randomUUID(), "Empty source"), passages: [] },
      ownerSource.connectionId,
    );
  app
    .experience()
    .replace(
      "owner",
      page(randomUUID(), "Obsolete workspace secret"),
      randomUUID(),
    );
  const status = async (cookie = app.owner.cookie) =>
    experienceStatusSchema.parse(
      await (
        await app.raw("/api/experience/status", { headers: { Cookie: cookie } })
      ).json(),
    );
  assert.deepEqual(await status(), { totalCount: 5, usableCount: 2 });
  assert.deepEqual(await status(app.friend.cookie), {
    totalCount: 1,
    usableCount: 1,
  });
  assert.equal(
    (await app.raw("/api/experience/status", { headers: { Cookie: "" } }))
      .status,
    401,
  );
  assert.equal(
    (
      await app.raw("/api/experience/status?userId=owner", {
        headers: { Cookie: app.friend.cookie },
      })
    ).status,
    400,
  );
  assert.equal(
    (await app.raw("/api/experience/status", { method: "POST" })).status,
    405,
  );

  const submit = async (
    interview?: InterviewInput,
    cookie = app.owner.cookie,
    content = "Describe the database migration rollback.",
  ) => {
    const conversation = conversationSchema.parse(
      await (
        await app.raw("/api/conversations", {
          method: "POST",
          headers: { Cookie: cookie },
        })
      ).json(),
    );
    const response = await app.raw(
      `/api/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ content, ...(interview ? { interview } : {}) }),
      },
    );
    assert.equal(response.status, 200);
    await response.text();
    const history = historySchema.parse(
      await (
        await app.raw(`/api/conversations/${conversation.id}`, {
          headers: { Cookie: cookie },
        })
      ).json(),
    );
    return { conversation, history, model: histories.at(-1) };
  };
  const pasted = "My pasted migration contribution.";
  const enabled = await submit({ experience: pasted, useSources: true });
  const payload = JSON.parse(enabled.model?.[1]?.content ?? "");
  assert.equal(payload.experience, pasted);
  assert.deepEqual(
    new Set(
      payload.sources.map((source: { sourceId: string }) => source.sourceId),
    ),
    new Set([ownerSource.id, legacy.id]),
  );
  assert(!JSON.stringify(enabled.model).includes("Friend secret"));
  assert(!JSON.stringify(enabled.model).includes("Failed secret"));
  assert(!JSON.stringify(enabled.model).includes("Obsolete workspace secret"));
  assert.deepEqual(enabled.history.messages[1]?.sources, payload.sources);
  for (const source of enabled.history.messages[1]?.sources ?? []) {
    assert(source.title);
    assert(source.importedAt);
    assert.match(source.url, /^https:\/\/www\.notion\.so\/.*#/);
  }
  const disabled = await submit({ experience: pasted, useSources: false });
  assert.deepEqual(JSON.parse(disabled.model?.[1]?.content ?? ""), {
    question: "Describe the database migration rollback.",
    experience: pasted,
  });
  assert.deepEqual(disabled.history.messages[1]?.sources, []);
  assert(!JSON.stringify(disabled.model).includes("Owner secret"));
  const friend = await submit(
    { experience: "", useSources: true },
    app.friend.cookie,
  );
  assert.deepEqual(
    friend.history.messages[1]?.sources.map((source) => source.sourceId),
    [friendSource.id],
  );
  assert(!JSON.stringify(friend.model).includes("Owner secret"));
  for (const interview of [
    undefined,
    { experience: "", inputSource: "speech" as const, useSources: true },
    { experience: pasted, useExperience: false, useSources: true },
  ]) {
    const result = await submit(interview);
    assert.deepEqual(result.history.messages[1]?.sources, []);
    assert(!JSON.stringify(result.model).includes("Owner secret"));
    assert(!JSON.stringify(result.model).includes("Owner legacy"));
  }
  const unmatched = await submit(
    { experience: "", useSources: true },
    app.owner.cookie,
    "Explain photosynthesis.",
  );
  assert.deepEqual(unmatched.history.messages[1]?.sources, []);
  assert.match(
    unmatched.model?.[0]?.content ?? "",
    /Never invent personal experience/,
  );
  assert.match(unmatched.model?.[0]?.content ?? "", /general framework/);

  revoked = true;
  await app.post("/check");
  assert.equal((await app.status()).kind, "reconnect_required");
  assert.deepEqual(await status(), { totalCount: 5, usableCount: 1 });
  const disconnected = await submit({ experience: "", useSources: true });
  assert.deepEqual(
    disconnected.history.messages[1]?.sources.map((source) => source.sourceId),
    [legacy.id],
  );
  assert(!JSON.stringify(disconnected.model).includes("Owner secret"));
  await app.request("", { method: "DELETE" });
  app.experience().remove("owner", legacy.id);
  const retained = historySchema.parse(
    await (
      await app.raw(`/api/conversations/${enabled.conversation.id}`)
    ).json(),
  );
  assert.deepEqual(retained, enabled.history);
  await app.restart();
  assert.deepEqual(await status(), { totalCount: 1, usableCount: 0 });
  assert.deepEqual(await status(app.friend.cookie), {
    totalCount: 1,
    usableCount: 1,
  });
});

test("prompt source exclusion preserves pasted samples and context budgets independently", () => {
  const candidate = {
    sourceId: randomUUID(),
    pageId: randomUUID(),
    blockId: randomUUID(),
    title: "Private source",
    url: `https://www.notion.so/${randomUUID().replaceAll("-", "")}`,
    excerpt: "Private imported evidence",
    importedAt: new Date().toISOString(),
  };
  const input = { experience: "Pasted contribution", useSources: false };
  const result = interviewContext("Explain the decision", input, 8000, [
    candidate,
  ]);
  assert.deepEqual(result.sources, []);
  assert.equal(
    JSON.parse(result.history[1]?.content ?? "").experience,
    input.experience,
  );
  assert(!JSON.stringify(result.history).includes(candidate.excerpt));
  assert.doesNotThrow(() =>
    interviewContext("Explain the decision", input, result.historyChars, [
      candidate,
    ]),
  );
  assert.throws(
    () =>
      interviewContext("Explain the decision", input, result.historyChars - 1, [
        candidate,
      ]),
    /context budget/,
  );
  const speech = interviewContext(
    "Explain the decision",
    { experience: "", inputSource: "speech", useSources: true },
    8000,
    [candidate],
  );
  assert.deepEqual(speech.sources, []);
  assert(!JSON.stringify(speech.history).includes(candidate.excerpt));
});
