import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import {
  atomicWrite,
  hostId,
  readCredential,
  withCredentialLock,
} from "./credentials.js";
import { exchange } from "./tokens.js";

const keys = createRemoteJWKSet(
  new URL("https://auth.openai.com/.well-known/jwks.json"),
  { timeoutDuration: 5000 },
);
export async function verifyIdentity(
  token: string,
  audience: string,
  nonce: string,
  verifier: JWTVerifyGetKey = keys,
) {
  const { payload } = await jwtVerify(token, verifier, {
    issuer: "https://auth.openai.com",
    audience,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "email", "exp", "nonce"],
  });
  const identity = z
    .object({
      sub: z.string().min(1).max(256),
      email: z.email().max(320),
      nonce: z.literal(nonce),
    })
    .parse(payload);
  if (payload.azp !== undefined && payload.azp !== audience)
    throw new Error("ChatGPT identity audience did not match.");
  return identity;
}

export async function connectChatGPT(options: {
  credentialPath: string;
  openBrowser: (url: string) => Promise<void>;
  fetch?: typeof fetch;
  verify?: typeof verifyIdentity;
  timeoutMs?: number;
}): Promise<void> {
  await withCredentialLock(options.credentialPath, async () => {
    const previous = await readCredential(options.credentialPath);
    const host = await hostId(options.credentialPath);
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    let resolveCallback: (url: URL) => void = () => undefined;
    let rejectCallback: (error: Error) => void = () => undefined;
    const callback = new Promise<URL>((resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    });
    void callback.catch(() => undefined);
    let received = false;
    let expectedHost = "";
    const server = createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Content-Security-Policy", "default-src 'none'");
      if (
        request.method !== "GET" ||
        request.headers.host !== expectedHost ||
        (request.url?.length ?? 0) > 8192
      ) {
        response.writeHead(400).end("Invalid callback.");
        return;
      }
      let url: URL;
      try {
        const target = request.url ?? "/";
        if (
          !target.startsWith("/") ||
          target.startsWith("//") ||
          target.includes("\\")
        )
          throw new Error("Invalid request target");
        url = new URL(target, `http://${expectedHost}`);
      } catch {
        response.writeHead(400).end("Invalid callback.");
        return;
      }
      const supplied = url.searchParams.get("state") ?? "";
      if (
        url.pathname !== "/auth/callback" ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(state) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(state))
      ) {
        response.writeHead(400).end("Invalid callback.");
        return;
      }
      if (received) {
        response
          .writeHead(409)
          .end("This sign-in attempt has already returned.");
        return;
      }
      received = true;
      response.end(
        "Return to the Panky terminal to check whether connection completed. You may close this tab.",
      );
      resolveCallback(url);
    });
    server.listen(0, "127.0.0.1");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Could not start local ChatGPT sign-in.");
      expectedHost = `127.0.0.1:${address.port}`;
      const redirectUri = `http://${expectedHost}/auth/callback`;
      const url = new URL("https://auth.openai.com/api/accounts/authorize");
      url.search = new URLSearchParams({
        client_id: previous?.clientId ?? "dynamic_agent_client",
        ...(previous ? {} : { agent_name_hint: "Panky" }),
        ext_agent_host_id: host,
        response_type: "code",
        redirect_uri: redirectUri,
        scope:
          "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        resource: "https://api.openai.com/v1",
        state,
        nonce,
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
      }).toString();
      timer = setTimeout(
        () =>
          rejectCallback(
            new Error("ChatGPT sign-in timed out. Run the command again."),
          ),
        options.timeoutMs ?? 300000,
      );
      await options.openBrowser(url.toString());
      const result = await callback;
      if (result.searchParams.has("error"))
        throw new Error("ChatGPT sign-in was not granted.");
      const code = result.searchParams.get("code");
      const clientId =
        result.searchParams.get("client_id") ?? previous?.clientId;
      if (
        !code ||
        !clientId ||
        clientId === "dynamic_agent_client" ||
        clientId.length > 256 ||
        (previous && previous.clientId !== clientId)
      )
        throw new Error("ChatGPT returned an invalid registration.");
      const tokens = await exchange(
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          resource: "https://api.openai.com/v1",
        }),
        options.fetch,
      );
      if (!tokens.id_token)
        throw new Error("ChatGPT did not provide an identity token.");
      const identity = await (options.verify ?? verifyIdentity)(
        tokens.id_token,
        clientId,
        nonce,
      );
      if (previous && identity.sub !== previous.subject)
        throw new Error(
          "ChatGPT returned a different account. Disconnect the existing account first.",
        );
      const scopes = tokens.scope?.split(/\s+/u) ?? [];
      if (!scopes.includes("chatgpt.tokens.use.direct"))
        throw new Error("ChatGPT plan permission was not granted.");
      await atomicWrite(options.credentialPath, {
        clientId,
        subject: identity.sub,
        email: identity.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        scopes,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /^ChatGPT |^Could not start local/u.test(error.message)
      )
        throw error;
      throw new Error(
        "ChatGPT sign-in could not be completed. Run the command again.",
      );
    } finally {
      if (timer) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
