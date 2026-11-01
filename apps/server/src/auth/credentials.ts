import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const hashSecret = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function readCookie(request: IncomingMessage, name: string) {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return "";
  const value = values[0]?.slice(name.length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}
export function setCookie(
  response: ServerResponse,
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
) {
  const item = `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const previous = response.getHeader("Set-Cookie");
  response.setHeader("Set-Cookie", [
    ...(Array.isArray(previous)
      ? previous
      : previous
        ? [String(previous)]
        : []),
    item,
  ]);
}
