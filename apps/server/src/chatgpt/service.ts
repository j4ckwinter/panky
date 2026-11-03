import { rm } from "node:fs/promises";
import { z } from "zod";
import { HttpError } from "../http-utils.js";
import type { ModelProvider } from "../providers/provider.js";
import {
  atomicWrite,
  readCredential,
  withCredentialLock,
} from "./credentials.js";
import { ChatGPTProvider } from "./provider.js";
import { boundedJson, exchange, refreshedCredential } from "./tokens.js";

export type ChatGPTStatus =
  | { kind: "unavailable" | "disconnected" | "reconnect_required" }
  | { kind: "connected"; email: string };
const modelSchema = z.object({
  models: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        display_name: z.string().min(1).max(200),
        visibility: z.string(),
      }),
    )
    .max(200),
});

function waitForToken(
  token: Promise<string>,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    token.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

export class ChatGPTService {
  private refreshing: Promise<string> | null = null;
  private lifetime = new AbortController();
  private invalid = false;
  private readonly request: typeof fetch;
  constructor(
    private readonly options: {
      credentialPath: string;
      enabled: boolean;
      fetch?: typeof fetch;
    },
  ) {
    this.request = options.fetch ?? fetch;
  }
  async status(): Promise<ChatGPTStatus> {
    if (!this.options.enabled) return { kind: "unavailable" };
    try {
      const credential = await readCredential(this.options.credentialPath);
      if (!credential) return { kind: "disconnected" };
      if (
        this.invalid ||
        !credential.scopes.includes("chatgpt.tokens.use.direct")
      )
        return { kind: "reconnect_required" };
      return { kind: "connected", email: credential.email };
    } catch {
      return { kind: "reconnect_required" };
    }
  }
  private async token(): Promise<string> {
    if (!this.options.enabled)
      throw new Error("ChatGPT subscription access is disabled.");
    if (this.refreshing) return this.refreshing;
    this.refreshing = withCredentialLock(
      this.options.credentialPath,
      async () => {
        const credential = await readCredential(this.options.credentialPath);
        if (
          !credential ||
          !credential.scopes.includes("chatgpt.tokens.use.direct")
        )
          throw new Error("Connect ChatGPT locally first.");
        if (credential.expiresAt > Date.now() + 60000)
          return credential.accessToken;
        try {
          const token = await exchange(
            new URLSearchParams({
              grant_type: "refresh_token",
              client_id: credential.clientId,
              refresh_token: credential.refreshToken,
              resource: "https://api.openai.com/v1",
            }),
            this.request,
          );
          const next = refreshedCredential(credential, token);
          await atomicWrite(this.options.credentialPath, next);
          this.invalid = false;
          return next.accessToken;
        } catch {
          this.invalid = true;
          throw new Error("Reconnect ChatGPT locally.");
        }
      },
    );
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }
  private async authorized(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const lifetime = this.lifetime.signal;
    const signal = AbortSignal.any([
      lifetime,
      init.signal ?? AbortSignal.timeout(15000),
    ]);
    signal.throwIfAborted();
    const token = await waitForToken(this.token(), signal);
    signal.throwIfAborted();
    const response = await this.request(url, {
      ...init,
      redirect: "error",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 401 || response.status === 403) this.invalid = true;
    return response;
  }
  async models(
    signal?: AbortSignal,
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await this.authorized(
        "https://api.openai.com/v1/models",
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          "ChatGPT models are unavailable. Check the connection and plan access.",
        );
      }
      return modelSchema
        .parse(await boundedJson(response))
        .models.filter((model) => model.visibility === "list")
        .map((model) => ({ id: model.slug, name: model.display_name }));
    } catch {
      signal?.throwIfAborted();
      throw new HttpError(
        503,
        "ChatGPT models are unavailable. Check your plan access or reconnect locally.",
      );
    }
  }
  provider(model: string): ModelProvider {
    return new ChatGPTProvider(model, async (body, signal) => {
      const models = await this.models(signal);
      signal.throwIfAborted();
      if (!models.some((entry) => entry.id === model))
        throw new Error("The selected ChatGPT model is no longer available.");
      return this.authorized("https://api.openai.com/v1/responses", {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      });
    });
  }
  async disconnect(): Promise<void> {
    this.lifetime.abort();
    if (this.refreshing) await this.refreshing.catch(() => undefined);
    let revoked = true;
    try {
      await withCredentialLock(this.options.credentialPath, async () => {
        const credential = await readCredential(
          this.options.credentialPath,
        ).catch(() => {
          revoked = false;
          return null;
        });
        if (credential) {
          try {
            const response = await this.request(
              "https://auth.openai.com/api/accounts/oauth/revoke",
              {
                method: "POST",
                redirect: "error",
                signal: AbortSignal.timeout(10000),
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  token: credential.refreshToken,
                  token_type_hint: "refresh_token",
                  client_id: credential.clientId,
                }),
              },
            );
            revoked = response.ok;
            await response.body?.cancel();
          } catch {
            revoked = false;
          }
        }
        await rm(this.options.credentialPath, { force: true });
      });
    } finally {
      this.lifetime = new AbortController();
      this.invalid = false;
    }
    if (!revoked)
      throw new HttpError(
        502,
        "Disconnected locally. Remote revocation was not confirmed; disconnect Panky in ChatGPT Settings too.",
      );
  }
  close() {
    this.lifetime.abort();
  }
}
