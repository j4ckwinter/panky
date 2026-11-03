import { z } from "zod";
import type { Credential } from "./credentials.js";

export const tokenSchema = z.object({
  access_token: z.string().min(1).max(32768),
  refresh_token: z.string().min(1).max(32768),
  id_token: z.string().min(1).max(32768).optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().min(1).max(86400),
  scope: z.string().max(4000).optional(),
});
export async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("ChatGPT returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 1048576)
        throw new Error("ChatGPT returned an oversized response.");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function exchange(
  parameters: URLSearchParams,
  request: typeof fetch = fetch,
) {
  const response = await request(
    "https://auth.openai.com/api/accounts/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: parameters,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      "ChatGPT authorization expired or could not be renewed. Reconnect locally.",
    );
  }
  return tokenSchema.parse(await boundedJson(response));
}
export function refreshedCredential(
  previous: Credential,
  token: z.infer<typeof tokenSchema>,
): Credential {
  const scopes =
    token.scope === undefined ? previous.scopes : token.scope.split(/\s+/u);
  if (!scopes.includes("chatgpt.tokens.use.direct"))
    throw new Error("ChatGPT plan permission was not granted.");
  return {
    ...previous,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    idToken: token.id_token ?? previous.idToken,
    scopes,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
