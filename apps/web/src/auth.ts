import {
  authStatusSchema,
  deviceSessionsSchema,
  errorSchema,
} from "@panky/shared";
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

export type { AuthStatus, DeviceSession } from "@panky/shared";

import { ApiError } from "./api";

async function request(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "ngrok-skip-browser-warning": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(
      "Could not reach Panky. Check your connection and try again.",
    );
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const result = errorSchema.safeParse(data);
    throw new ApiError(
      result.success
        ? result.data.error
        : "Could not complete sign-in. Try again.",
      response.status,
    );
  }
  return data;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Panky returned an invalid authentication response.");
  return value as Record<string, unknown>;
}

export async function authStatus() {
  return authStatusSchema.parse(await request("/status"));
}

export async function registerPasskey(token: string) {
  const options = object(await request("/register/options", { token }));
  if (
    typeof options.challenge !== "string" ||
    !options.rp ||
    !options.user ||
    !Array.isArray(options.pubKeyCredParams)
  )
    throw new Error("Panky returned invalid passkey options.");
  const response = await startRegistration({
    optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  await request("/register/verify", { response });
}

export async function signIn() {
  const options = object(await request("/login/options", {}));
  if (typeof options.challenge !== "string")
    throw new Error("Panky returned invalid passkey options.");
  const response = await startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  await request("/login/verify", { response });
}

export async function signOut() {
  await request("/logout", {});
}

export async function recover(token: string) {
  await request("/recover", { token });
}

export async function sessions() {
  return deviceSessionsSchema.parse(await request("/sessions")).sessions;
}

export async function revokeSession(id: string) {
  await request("/sessions/revoke", { id });
}

export function signInError(error: unknown) {
  if (
    error instanceof Error &&
    (error.name === "NotAllowedError" ||
      error.name === "AbortError" ||
      (error.cause instanceof Error &&
        error.cause.name === "NotAllowedError") ||
      ("code" in error && error.code === "ERROR_CEREMONY_ABORTED"))
  )
    return "Passkey sign-in was cancelled or timed out. You can try again.";
  return error instanceof Error
    ? error.message
    : "Could not sign in. Try again.";
}
