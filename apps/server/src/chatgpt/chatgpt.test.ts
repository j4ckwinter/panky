import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { connectChatGPT, verifyIdentity } from "./connect.js";
import { atomicWrite, type Credential, readCredential } from "./credentials.js";
import { ChatGPTProvider } from "./provider.js";
import { ChatGPTService } from "./service.js";

const credential: Credential = {
  clientId: "oaiapp_test",
  subject: "owner",
  email: "owner@example.com",
  accessToken: "secret-access",
  refreshToken: "secret-refresh",
  idToken: "secret-id",
  scopes: ["chatgpt.tokens.use.direct"],
  expiresAt: Date.now() + 3600000,
};
async function temporary(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), "panky-chatgpt-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, "credentials.json");
}
function sse(events: unknown[]) {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
async function collectEvents<T>(events: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}
async function collect(
  provider: ChatGPTProvider,
  signal = new AbortController().signal,
) {
  return collectEvents(
    provider.stream(
      [
        { role: "system", content: "Use evidence" },
        { role: "user", content: "Question" },
      ],
      [],
      signal,
    ),
  );
}

test("subscription provider sends supported fields and requires terminal completion", async () => {
  let body: unknown;
  const provider = new ChatGPTProvider("model-a", async (value) => {
    body = value;
    return sse([
      { type: "response.output_text.delta", delta: "Answer" },
      { type: "response.completed" },
    ]);
  });
  assert.deepEqual(await collect(provider), [
    { type: "delta", text: "Answer" },
    { type: "complete" },
  ]);
  assert.deepEqual(body, {
    model: "model-a",
    input: [
      { role: "developer", content: "Use evidence" },
      { role: "user", content: "Question" },
    ],
    store: false,
    stream: true,
  });
  await assert.rejects(
    collect(
      new ChatGPTProvider("model-a", async () =>
        sse([{ type: "response.output_text.delta", delta: "Partial" }]),
      ),
    ),
    /without completing/u,
  );
});

test("subscription provider stops on limit errors without retries or leaked details", async () => {
  let calls = 0;
  const provider = new ChatGPTProvider("model", async () => {
    calls++;
    return sse([
      { type: "response.output_text.delta", delta: "Partial" },
      { type: "response.failed", error: { message: "secret-access" } },
    ]);
  });
  await assert.rejects(
    collect(provider),
    (error: Error) =>
      /did not complete/u.test(error.message) &&
      !error.message.includes("secret"),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    collect(
      new ChatGPTProvider("model", async () =>
        sse([{ type: "response.output_text.delta", delta: "x".repeat(16001) }]),
      ),
    ),
  );
});

test("subscription provider rejects tools and cancellation before network", async () => {
  let calls = 0;
  const provider = new ChatGPTProvider("model", async () => {
    calls++;
    return sse([]);
  });
  await assert.rejects(
    collectEvents(
      provider.stream(
        [],
        [{ name: "clock", description: "clock", parameters: {} }],
        new AbortController().signal,
      ),
    ),
    /not enabled/u,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(collect(provider, controller.signal));
  assert.equal(calls, 0);
});

test("service keeps status credentials private and lists only visible models", async (t) => {
  const path = await temporary(t);
  let calls = 0;
  const service = new ChatGPTService({
    enabled: true,
    credentialPath: path,
    fetch: async (_url, init) => {
      calls++;
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer secret-access",
      );
      return Response.json({
        models: [
          { slug: "a", display_name: "Model A", visibility: "list" },
          { slug: "hidden", display_name: "Hidden", visibility: "hidden" },
        ],
      });
    },
  });
  assert.deepEqual(await service.status(), { kind: "disconnected" });
  await atomicWrite(path, credential);
  assert.deepEqual(await service.status(), {
    kind: "connected",
    email: "owner@example.com",
  });
  assert.deepEqual(await service.models(), [{ id: "a", name: "Model A" }]);
  assert.equal(calls, 1);
  const disabled = new ChatGPTService({ enabled: false, credentialPath: path });
  assert.deepEqual(await disabled.status(), { kind: "unavailable" });
  await assert.rejects(disabled.models(), /unavailable/u);
  if (process.platform !== "win32")
    assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("refresh rotates credentials atomically and serializes concurrent requests", async (t) => {
  const path = await temporary(t);
  await atomicWrite(path, { ...credential, expiresAt: Date.now() - 1 });
  let refreshes = 0;
  const service = new ChatGPTService({
    enabled: true,
    credentialPath: path,
    fetch: async (url, init) => {
      if (String(url).endsWith("/oauth/token")) {
        refreshes++;
        assert.equal(
          new URLSearchParams(String(init?.body)).get("client_id"),
          "oaiapp_test",
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
        return Response.json({
          access_token: "next-access",
          refresh_token: "next-refresh",
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer next-access",
      );
      return Response.json({ models: [] });
    },
  });
  await Promise.all([service.models(), service.models()]);
  assert.equal(refreshes, 1);
  assert.equal((await readCredential(path))?.refreshToken, "next-refresh");
});

test("disconnect revokes session and removes credentials even when revocation fails", async (t) => {
  const path = await temporary(t);
  await atomicWrite(path, credential);
  const service = new ChatGPTService({
    enabled: true,
    credentialPath: path,
    fetch: async (_url, init) => {
      assert.equal(
        new URLSearchParams(String(init?.body)).get("token"),
        "secret-refresh",
      );
      return new Response("private error", { status: 503 });
    },
  });
  await assert.rejects(service.disconnect(), /Disconnected locally/u);
  assert.equal(await readCredential(path), null);
  assert.deepEqual(await service.status(), { kind: "disconnected" });
});

test("OAuth loopback validates state, PKCE and granted permission before storage", async (t) => {
  const path = await temporary(t);
  let authorize: URL | undefined;
  await connectChatGPT({
    credentialPath: path,
    openBrowser: async (raw) => {
      authorize = new URL(raw);
      assert.equal(
        authorize.searchParams.get("client_id"),
        "dynamic_agent_client",
      );
      const callback = new URL(authorize.searchParams.get("redirect_uri")!);
      for (const target of ["http://[", "//[", "/\\[", "/%"]) {
        const status = await new Promise<number | undefined>(
          (resolve, reject) => {
            const attempt = request(
              { hostname: "127.0.0.1", port: callback.port, path: target },
              (response) => {
                response.resume();
                response.on("end", () => resolve(response.statusCode));
              },
            );
            attempt.on("error", reject);
            attempt.end();
          },
        );
        assert.equal(status, 400);
      }

      callback.search = new URLSearchParams({
        state: "bad-state",
        code: "code",
        client_id: "oaiapp_new",
      }).toString();
      assert.equal((await fetch(callback)).status, 400);
      callback.searchParams.set("state", authorize.searchParams.get("state")!);
      assert.equal((await fetch(callback)).status, 200);
    },
    fetch: async (_url, init) => {
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("client_id"), "oaiapp_new");
      assert.equal(
        form.get("redirect_uri"),
        authorize!.searchParams.get("redirect_uri"),
      );
      assert.ok(form.get("code_verifier"));
      return Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        id_token: "signed",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid chatgpt.tokens.use.direct",
      });
    },
    verify: async (_token, audience, nonce) => {
      assert.equal(audience, "oaiapp_new");
      assert.equal(nonce, authorize!.searchParams.get("nonce"));
      return { sub: "owner", email: "owner@example.com", nonce };
    },
  });
  assert.equal((await readCredential(path))?.clientId, "oaiapp_new");
  assert.ok(await readFile(`${path}.host`, "utf8"));
});

test("OAuth refuses replacing a connected account with a different identity", async (t) => {
  const path = await temporary(t);
  await atomicWrite(path, credential);
  await assert.rejects(
    connectChatGPT({
      credentialPath: path,
      openBrowser: async (raw) => {
        const authorize = new URL(raw);
        const callback = new URL(authorize.searchParams.get("redirect_uri")!);
        callback.search = new URLSearchParams({
          state: authorize.searchParams.get("state")!,
          code: "code",
        }).toString();
        await fetch(callback);
      },
      fetch: async () =>
        Response.json({
          access_token: "other",
          refresh_token: "other",
          id_token: "other",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "chatgpt.tokens.use.direct",
        }),
      verify: async (_token, _audience, nonce) => ({
        sub: "other",
        email: "other@example.com",
        nonce,
      }),
    }),
    /different account/u,
  );
  assert.deepEqual(await readCredential(path), credential);
});

test("identity verification checks signature, audience and nonce", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  const token = await new SignJWT({
    email: "owner@example.com",
    nonce: "expected",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://auth.openai.com")
    .setAudience("oaiapp_test")
    .setSubject("owner")
    .setExpirationTime("1h")
    .sign(privateKey);
  assert.equal(
    (await verifyIdentity(token, "oaiapp_test", "expected", keys)).sub,
    "owner",
  );
  await assert.rejects(verifyIdentity(token, "other", "expected", keys));
  await assert.rejects(verifyIdentity(token, "oaiapp_test", "wrong", keys));
});

test("model selection is checked against account catalog before sending a prompt", async (t) => {
  const path = await temporary(t);
  await atomicWrite(path, credential);
  let calls = 0;
  const service = new ChatGPTService({
    enabled: true,
    credentialPath: path,
    fetch: async (url) => {
      calls++;
      assert.ok(String(url).endsWith("/models"));
      return Response.json({
        models: [
          { slug: "allowed", display_name: "Allowed", visibility: "list" },
        ],
      });
    },
  });
  await assert.rejects(
    collectEvents(
      service
        .provider("other")
        .stream(
          [{ role: "user", content: "Private prompt" }],
          [],
          new AbortController().signal,
        ),
    ),
  );
  assert.equal(calls, 1);
});

test("disconnect aborts a pending subscription request", async (t) => {
  const path = await temporary(t);
  await atomicWrite(path, credential);
  let started: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const service = new ChatGPTService({
    enabled: true,
    credentialPath: path,
    fetch: async (url, init) => {
      if (String(url).endsWith("/oauth/revoke"))
        return new Response(null, { status: 200 });
      if (String(url).endsWith("/models"))
        return Response.json({
          models: [
            { slug: "allowed", display_name: "Allowed", visibility: "list" },
          ],
        });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("Aborted")),
          { once: true },
        );
        started();
      });
    },
  });
  const task = assert.rejects(
    collectEvents(
      service
        .provider("allowed")
        .stream(
          [{ role: "user", content: "Prompt" }],
          [],
          new AbortController().signal,
        ),
    ),
  );
  await pending;
  await service.disconnect();
  await task;
  assert.equal(await readCredential(path), null);
});

test("OAuth refuses identity-only grants and leaves no credential record", async (t) => {
  const path = await temporary(t);
  await assert.rejects(
    connectChatGPT({
      credentialPath: path,
      openBrowser: async (raw) => {
        const authorize = new URL(raw);
        const callback = new URL(authorize.searchParams.get("redirect_uri")!);
        callback.search = new URLSearchParams({
          state: "é".repeat(43),
          code: "code",
          client_id: "oaiapp_new",
        }).toString();
        assert.equal((await fetch(callback)).status, 400);
        callback.searchParams.set(
          "state",
          authorize.searchParams.get("state")!,
        );
        await fetch(callback);
      },
      fetch: async () =>
        Response.json({
          access_token: "new",
          refresh_token: "new",
          id_token: "signed",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email",
        }),
      verify: async (_token, _audience, nonce) => ({
        sub: "owner",
        email: "owner@example.com",
        nonce,
      }),
    }),
    /permission was not granted/u,
  );
  assert.equal(await readCredential(path), null);
});

test("caller cancellation interrupts model lookup without sending inference", async (t) => {
  const path = await temporary(t);
  await atomicWrite(path, credential);
  let started: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const service = new ChatGPTService({
    enabled: true,
    credentialPath: path,
    fetch: async (_url, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
        started();
      });
    },
  });
  const controller = new AbortController();
  const cancelled = assert.rejects(
    collectEvents(
      service.provider("allowed").stream([], [], controller.signal),
    ),
    (error) => error === controller.signal.reason,
  );
  await pending;
  controller.abort();
  await cancelled;
  assert.equal(calls, 1);
});

test("caller cancellation returns during shared refresh while preserving rotated credentials", async (t) => {
  const path = await temporary(t);
  await atomicWrite(path, { ...credential, expiresAt: Date.now() - 1 });
  let started: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let refreshes = 0;
  let catalogs = 0;
  const service = new ChatGPTService({
    enabled: true,
    credentialPath: path,
    fetch: async (url) => {
      if (String(url).endsWith("/oauth/token")) {
        refreshes++;
        started();
        return response;
      }
      catalogs++;
      return Response.json({ models: [] });
    },
  });
  const controller = new AbortController();
  const cancelled = assert.rejects(
    collectEvents(
      service.provider("allowed").stream([], [], controller.signal),
    ),
    (error) => error === controller.signal.reason,
  );
  await pending;
  controller.abort();
  await cancelled;
  assert.equal(catalogs, 0);
  const next = service.models();
  finish(
    Response.json({
      access_token: "rotated",
      refresh_token: "rotated-refresh",
      token_type: "Bearer",
      expires_in: 3600,
    }),
  );
  await next;
  assert.equal(refreshes, 1);
  assert.equal(catalogs, 1);
  assert.equal((await readCredential(path))?.refreshToken, "rotated-refresh");
});
