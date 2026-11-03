import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conversationSchema,
  historySchema,
  experienceSourceSchema,
  notionSourcesSchema,
} from "@panky/shared";
import { HttpError } from "../http-utils.js";
import type { ImportedPage } from "../experience/imported-page.js";
import { NotionAuthorizationError, NotionTemporaryError } from "./notion.js";
import { deferred, fixture, tokens } from "./test-support.js";

const pageId = "11111111-1111-4111-8111-111111111111";
const secondId = "33333333-3333-4333-8333-333333333333";
function page(id = pageId, title = "Migration evidence"): ImportedPage {
  return {
    pageId: id,
    title,
    warnings: ["Images skipped."],
    passages: [
      {
        blockId: "22222222-2222-4222-8222-222222222222",
        text: `I led a database migration for ${title}.`,
      },
    ],
  };
}

test("OAuth sources use account credentials, reject forged ownership and isolate copies of the same page", async (t) => {
  let connections = 0;
  const seen: string[] = [];
  const app = await fixture(
    t,
    {
      exchange: async () => ({
        ...tokens,
        access_token: `account-${++connections}`,
      }),
    },
    true,
    {
      importer: async (id, token) => {
        seen.push(token);
        return page(id, token);
      },
      searcher: async (_input, token) => {
        seen.push(token);
        return { pages: [{ id: pageId, title: token }], nextCursor: null };
      },
    },
  );
  await app.connect();
  await app.connect(app.friend);
  const owner = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: pageId })).json(),
  );
  const friend = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: pageId }, app.friend)).json(),
  );
  assert.notEqual(owner.id, friend.id);
  assert.notEqual(owner.connectionId, friend.connectionId);
  assert.deepEqual(seen, ["account-1", "account-2"]);
  assert.equal(
    (await app.request(`/sources/${owner.id}`, {}, app.friend)).status,
    404,
  );
  assert.equal(
    (await app.post(`/sources/${owner.id}/refresh`, {}, app.friend)).status,
    404,
  );
  assert.equal(
    (
      await app.request(
        `/sources/${owner.id}`,
        { method: "DELETE" },
        app.friend,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await app.post(
        "/sources",
        { page: secondId, userId: "owner" },
        app.friend,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await app.post(
        "/pages/search",
        { query: "migration", connectionId: owner.connectionId },
        app.friend,
      )
    ).status,
    400,
  );
  const search = await app.post(
    "/pages/search",
    { query: "migration" },
    app.friend,
  );
  assert.deepEqual(await search.json(), {
    pages: [{ id: pageId, title: "account-2" }],
    nextCursor: null,
  });
  assert.equal(
    app.experience().search(app.friend.userId, "migration")[0]?.title,
    "account-2",
  );
  await app.restart();
  assert.equal(
    notionSourcesSchema.parse(
      await (await app.request("/sources", {}, app.friend)).json(),
    ).sources.length,
    1,
  );
  assert.equal(
    app.experience().search("owner", "migration")[0]?.title,
    "account-1",
  );
});

test("failed refresh retains inspectable copy, excludes retrieval and explicit successful refresh restores it", async (t) => {
  let fail = false;
  const app = await fixture(t, {}, true, {
    importer: async (id) => {
      if (fail)
        throw new HttpError(429, "Notion rate limit reached. Try later.");
      return page(id);
    },
  });
  await app.connect();
  const saved = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: pageId })).json(),
  );
  assert.equal(app.experience().search("owner", "migration").length, 1);
  fail = true;
  assert.equal((await app.post(`/sources/${saved.id}/refresh`)).status, 429);
  assert.equal((await app.request(`/sources/${saved.id}`)).status, 200);
  assert.equal(app.experience().search("owner", "migration").length, 0);
  const old = app.experience().detail("owner", saved.id);
  assert.equal(old?.source.importedAt, saved.importedAt);
  assert.equal(old?.passages.length, 1);
  fail = false;
  assert.equal((await app.post(`/sources/${saved.id}/refresh`)).status, 200);
  assert.equal(app.experience().search("owner", "migration").length, 1);
  assert.equal(
    (await app.request(`/sources/${saved.id}`, { method: "DELETE" })).status,
    204,
  );
  assert.equal(app.experience().search("owner", "migration").length, 0);
  assert.equal(
    app.db.prepare("SELECT COUNT(*) AS count FROM experience_search").get()
      ?.count,
    0,
  );
});

for (const refreshing of [false, true]) {
  test(`disconnect during ${refreshing ? "refresh" : "import"} cancels ignored aborts and survives restart`, async (t) => {
    const entered = deferred<AbortSignal>();
    const done = deferred<ImportedPage>();
    let slow = false;
    const app = await fixture(t, {}, true, {
      importer: async (_id, _token, signal) => {
        if (slow) {
          entered.resolve(signal);
          return done.promise;
        }
        return page();
      },
    });
    await app.connect();
    const saved = refreshing
      ? experienceSourceSchema.parse(
          await (await app.post("/sources", { page: pageId })).json(),
        )
      : null;
    slow = true;
    const pending = saved
      ? app.post(`/sources/${saved.id}/refresh`)
      : app.post("/sources", { page: pageId });
    const signal = await entered.promise;
    assert.equal((await app.post("/check")).status, 409);
    assert.equal((await app.post("/sources", { page: secondId })).status, 409);
    assert.equal((await app.request("", { method: "DELETE" })).status, 204);
    assert.equal(signal.aborted, true);
    done.resolve(page());
    assert.equal((await pending).status, 409);
    assert.deepEqual(await (await app.request("/sources")).json(), {
      sources: [],
    });
    await app.restart();
    assert.equal(app.experience().list("owner").length, 0);
    assert.equal(
      app.db.prepare("SELECT COUNT(*) AS count FROM experience_search").get()
        ?.count,
      0,
    );
    await app.connect();
    assert.deepEqual(await (await app.request("/sources")).json(), {
      sources: [],
    });
  });
}

test("authorization loss excludes the whole corpus through reconnect until each page is refreshed", async (t) => {
  let revoked = false;
  const app = await fixture(t, {}, true, {
    importer: async (id) => {
      if (revoked) throw new NotionAuthorizationError();
      return page(id);
    },
  });
  await app.connect();
  const first = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: pageId })).json(),
  );
  await app.post("/sources", { page: secondId });
  revoked = true;
  assert.equal((await app.post(`/sources/${first.id}/refresh`)).status, 409);
  assert.equal((await app.status()).kind, "reconnect_required");
  assert.equal(app.experience().search("owner", "migration").length, 0);
  assert.equal(
    app
      .experience()
      .list("owner")
      .filter((source) => source.error).length,
    2,
  );
  assert.equal((await app.request(`/sources/${first.id}`)).status, 200);
  await app.restart();
  assert.equal(app.experience().search("owner", "migration").length, 0);
  revoked = false;
  await app.connect();
  assert.equal(app.experience().search("owner", "migration").length, 0);
  assert.equal((await app.post(`/sources/${first.id}/refresh`)).status, 200);
  assert.equal(app.experience().search("owner", "migration").length, 1);
});

test("check detects revoked access and excludes corpus even when refresh is temporarily unavailable", async (t) => {
  const app = await fixture(
    t,
    {
      check: async () => {
        throw new NotionAuthorizationError();
      },
      refresh: async () => {
        throw new NotionTemporaryError();
      },
    },
    true,
    { importer: async () => page() },
  );
  await app.connect();
  await app.post("/sources", { page: pageId });
  assert.equal((await app.post("/check")).status, 502);
  assert.equal((await app.status()).kind, "connected");
  assert.equal(app.experience().search("owner", "migration").length, 0);
});

test("legacy sources migrate only on successful OAuth import and in-flight legacy refresh cannot resurrect them", async (t) => {
  const entered = deferred<void>();
  const done = deferred<ImportedPage>();
  let slowLegacy = false;
  let failOAuth = true;
  const app = await fixture(t, {}, true, {
    legacyToken: "legacy-private-token",
    importer: async (id, token) => {
      if (token === "legacy-private-token") {
        if (slowLegacy) {
          entered.resolve();
          return done.promise;
        }
        return page(id, "Legacy migration");
      }
      if (failOAuth) throw new HttpError(404, "Page unavailable.");
      return page(id, "OAuth migration");
    },
  });
  const legacyPost = (path: string) =>
    app.raw(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pageId }),
    });
  const saved = experienceSourceSchema.parse(
    await (await legacyPost("/api/experience")).json(),
  );
  await app.connect();
  assert.deepEqual(await (await app.request("/sources")).json(), {
    sources: [],
  });
  assert.equal((await app.post("/sources", { page: pageId })).status, 404);
  assert.equal(
    app.experience().detail("owner", saved.id)?.source.connectionId,
    null,
  );
  slowLegacy = true;
  const pending = legacyPost(`/api/experience/${saved.id}/refresh`);
  await entered.promise;
  failOAuth = false;
  assert.equal((await app.post("/sources", { page: pageId })).status, 409);
  done.resolve(page(pageId, "Legacy migration refreshed"));
  assert.equal((await pending).status, 200);
  const migrated = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: pageId })).json(),
  );
  assert.equal(migrated.id, saved.id);
  assert(migrated.connectionId);
  assert.equal(
    (await legacyPost(`/api/experience/${saved.id}/refresh`)).status,
    404,
  );
  assert.equal((await legacyPost("/api/experience")).status, 409);
  await app.request("", { method: "DELETE" });
  await app.restart();
  assert.equal(app.experience().list("owner").length, 0);
});

test("disconnect preserves independent legacy copies and another account's corpus", async (t) => {
  const app = await fixture(t, {}, true, { importer: async (id) => page(id) });
  const legacy = app.experience().replace("owner", page(secondId));
  await app.connect();
  await app.connect(app.friend);
  await app.post("/sources", { page: pageId });
  await app.post("/sources", { page: pageId }, app.friend);
  await app.request("", { method: "DELETE" });
  assert.deepEqual(
    app
      .experience()
      .list("owner")
      .map((source) => source.id),
    [legacy.id],
  );
  assert.equal(
    app.experience().search(app.friend.userId, "migration").length,
    1,
  );
});

test("source limit rejects new pages before import and still permits refresh", async (t) => {
  let calls = 0;
  const app = await fixture(t, {}, true, {
    importer: async (id) => {
      calls++;
      return page(id);
    },
  });
  await app.connect();
  for (let i = 0; i < 50; i++)
    app
      .experience()
      .replace(
        "owner",
        page(`00000000-0000-4000-8000-${i.toString().padStart(12, "0")}`),
      );
  assert.equal((await app.post("/sources", { page: pageId })).status, 409);
  assert.equal(calls, 0);
  assert.equal(
    (
      await app.post("/sources", {
        page: "00000000-0000-4000-8000-000000000000",
      })
    ).status,
    201,
  );
  assert.equal(calls, 1);
});

test("saved evidence survives explicit owner migration, removal, disconnect and restart", async (t) => {
  const app = await fixture(t, {}, true, {
    importer: async (id) => page(id, "OAuth migration"),
  });
  const legacy = app
    .experience()
    .replace("owner", page(pageId, "Legacy migration"));
  const conversation = conversationSchema.parse(
    await (await app.raw("/api/conversations", { method: "POST" })).json(),
  );
  const answer = async () => {
    const response = await app.raw(
      `/api/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Describe a database migration",
          interview: { experience: "" },
        }),
      },
    );
    assert.equal(response.status, 200);
    await response.text();
  };
  await answer();
  await app.connect();
  const migrated = experienceSourceSchema.parse(
    await (await app.post("/sources", { page: pageId })).json(),
  );
  assert.equal(migrated.id, legacy.id);
  await answer();
  const before = historySchema.parse(
    await (await app.raw(`/api/conversations/${conversation.id}`)).json(),
  );
  assert.equal(before.messages[1]?.sources[0]?.title, "Legacy migration");
  assert.equal(before.messages[3]?.sources[0]?.title, "OAuth migration");
  await app.request(`/sources/${migrated.id}`, { method: "DELETE" });
  await app.post("/sources", { page: pageId });
  await app.request("", { method: "DELETE" });
  await app.restart();
  const after = historySchema.parse(
    await (await app.raw(`/api/conversations/${conversation.id}`)).json(),
  );
  assert.deepEqual(after, before);
  assert.equal(app.experience().list("owner").length, 0);
});

test("revoked sessions cannot commit an in-flight page import", async (t) => {
  const entered = deferred<void>();
  const done = deferred<ImportedPage>();
  const app = await fixture(t, {}, true, {
    importer: async () => {
      entered.resolve();
      return done.promise;
    },
  });
  await app.connect();
  const pending = app.post("/sources", { page: pageId });
  await entered.promise;
  app.auth.revokeSession(app.owner.sessionId, app.owner.userId);
  done.resolve(page());
  assert.equal((await pending).status, 409);
  assert.equal(app.experience().list("owner").length, 0);
});
