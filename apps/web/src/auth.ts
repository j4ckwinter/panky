import {
  accessSchema,
  authStatusSchema,
  deviceSessionsSchema,
  errorSchema,
  googleOptionsSchema,
} from "@panky/shared";
import { ApiError } from "./api";

export type {
  Access,
  AuthStatus,
  AuthUser,
  DeviceSession,
} from "@panky/shared";

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

export async function authStatus() {
  return authStatusSchema.parse(await request("/status"));
}
export async function googleOptions() {
  return googleOptionsSchema.parse(await request("/google/options", {}));
}
export async function verifyGoogle(credential: string) {
  await request("/google/verify", { credential });
}
export async function signOut() {
  await request("/logout", {});
}
export async function sessions() {
  return deviceSessionsSchema.parse(await request("/sessions")).sessions;
}
export async function revokeSession(id: string) {
  await request("/sessions/revoke", { id });
}
export async function access() {
  return accessSchema.parse(await request("/access"));
}
export async function invite(email: string) {
  await request("/access/invite", { email });
}
export async function revokeAccess(email: string) {
  await request("/access/revoke", { email });
}
export function signInError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not sign in. Try again.";
}
