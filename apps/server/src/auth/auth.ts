import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthUser } from "@panky/shared";
import { z } from "zod";
import type { Config } from "../config.js";
import { HttpError, json, readJson } from "../http-utils.js";
import { hashSecret, readCookie, setCookie } from "./credentials.js";
import {
  type GoogleIdentity,
  type GoogleVerifier,
  googleIdentitySchema,
  verifyGoogleIdentity,
} from "./google.js";
import { AuthStore } from "./store.js";

const lifetime = 30 * 24 * 60 * 60 * 1000;
const emailSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
});

type Challenge = { nonce: string; expiresAt: number; revision: number };

export class Auth {
  private readonly store: AuthStore;
  private readonly challenges = new Map<string, Challenge>();
  private readonly secure: boolean;
  private readonly sessionName: string;
  private readonly challengeName: string;
  private rate = { start: 0, count: 0 };

  constructor(
    private readonly config: Config,
    private readonly verify: GoogleVerifier = verifyGoogleIdentity,
  ) {
    this.secure = new URL(config.AUTH_ORIGIN).protocol === "https:";
    this.sessionName = this.secure
      ? "__Host-panky-google-session"
      : "panky-google-session";
    this.challengeName = this.secure
      ? "__Host-panky-google-challenge"
      : "panky-google-challenge";
    this.store = new AuthStore(config.DATABASE_PATH, config.OWNER_EMAIL);
  }
  close() {
    this.store.close();
  }
  private configured() {
    return Boolean(this.config.GOOGLE_CLIENT_ID && this.config.OWNER_EMAIL);
  }
  private session(request: IncomingMessage) {
    return this.store.session(readCookie(request, this.sessionName));
  }
  authenticate(request: IncomingMessage): AuthUser | null {
    if (
      request.headers.origin &&
      request.headers.origin !== this.config.AUTH_ORIGIN
    )
      return null;
    if (
      request.method !== "GET" &&
      request.headers.origin !== this.config.AUTH_ORIGIN
    )
      return null;
    if (request.headers["sec-fetch-site"] === "cross-site") return null;
    const session = this.session(request);
    const user = session && this.store.user(session.userId);
    return user;
  }
  connectionSession(request: IncomingMessage) {
    if (!this.authenticate(request)) return null;
    const session = this.session(request);
    return session ? { userId: session.userId, sessionId: session.id } : null;
  }
  private issueSession(response: ServerResponse, userId: string) {
    const secret = randomBytes(32).toString("base64url");
    this.store.issueSession(userId, secret, lifetime);
    setCookie(response, this.sessionName, secret, lifetime / 1000, this.secure);
  }
  private limit() {
    if (Date.now() - this.rate.start > 60000)
      this.rate = { start: Date.now(), count: 0 };
    if (++this.rate.count > 60)
      throw new HttpError(
        429,
        "Too many sign-in attempts. Try again in a minute.",
      );
  }
  private setChallenge(request: IncomingMessage, response: ServerResponse) {
    for (const [key, value] of this.challenges)
      if (value.expiresAt <= Date.now()) this.challenges.delete(key);
    this.challenges.delete(hashSecret(readCookie(request, this.challengeName)));
    if (this.challenges.size >= 100)
      throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    const secret = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    this.challenges.set(hashSecret(secret), {
      nonce,
      expiresAt: Date.now() + 300000,
      revision: this.store.revision(),
    });
    setCookie(response, this.challengeName, secret, 300, this.secure);
    return nonce;
  }
  private takeChallenge(request: IncomingMessage, response: ServerResponse) {
    const key = hashSecret(readCookie(request, this.challengeName));
    const challenge = this.challenges.get(key);
    this.challenges.delete(key);
    setCookie(response, this.challengeName, "", 0, this.secure);
    if (
      !challenge ||
      challenge.expiresAt <= Date.now() ||
      challenge.revision !== this.store.revision()
    )
      throw new HttpError(401, "Sign-in expired. Start again.");
    return challenge;
  }
  async route(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
  ) {
    if (!path.startsWith("/api/auth/")) return false;
    if (
      request.headers.origin &&
      request.headers.origin !== this.config.AUTH_ORIGIN
    )
      throw new HttpError(403, "Use the configured sign-in origin.");
    if (request.headers["sec-fetch-site"] === "cross-site")
      throw new HttpError(403, "Cross-site sign-in is not allowed.");
    if (path === "/api/auth/status" && request.method === "GET") {
      const user = this.authenticate(request);
      json(response, 200, {
        authenticated: user !== null,
        configured: this.configured(),
        user,
        googleClientId: this.config.GOOGLE_CLIENT_ID ?? null,
      });
      return true;
    }
    if (path === "/api/auth/sessions" && request.method === "GET") {
      const current = this.session(request);
      if (!current) throw new HttpError(401, "Sign in to manage devices.");
      json(response, 200, {
        sessions: this.store.sessions(current),
      });
      return true;
    }
    if (path === "/api/auth/access" && request.method === "GET") {
      if (this.authenticate(request)?.role !== "owner")
        throw new HttpError(403, "Only the owner can manage access.");
      json(response, 200, this.store.access());
      return true;
    }
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    if (request.headers.origin !== this.config.AUTH_ORIGIN)
      throw new HttpError(403, "Origin is required for sign-in.");
    this.limit();
    const input = await readJson(request, "Request body is too large.");
    if (path === "/api/auth/google/options") {
      if (!this.configured())
        throw new HttpError(
          503,
          "Google sign-in is not configured on this backend.",
        );
      json(response, 200, {
        nonce: this.setChallenge(request, response),
        clientId: this.config.GOOGLE_CLIENT_ID,
      });
      return true;
    }
    if (path === "/api/auth/google/verify") {
      if (!this.config.GOOGLE_CLIENT_ID || !this.configured())
        throw new HttpError(
          503,
          "Google sign-in is not configured on this backend.",
        );
      const challenge = this.takeChallenge(request, response);
      const parsed = z
        .object({ credential: z.string().min(1).max(16384) })
        .safeParse(input);
      if (!parsed.success)
        throw new HttpError(400, "Invalid Google credential.");
      let identity: GoogleIdentity;
      try {
        identity = googleIdentitySchema.parse(
          await this.verify(
            parsed.data.credential,
            this.config.GOOGLE_CLIENT_ID,
          ),
        );
      } catch {
        throw new HttpError(
          401,
          "Google sign-in could not be verified. Try again.",
        );
      }
      if (
        identity.nonce !== challenge.nonce ||
        challenge.revision !== this.store.revision()
      )
        throw new HttpError(401, "Sign-in expired. Start again.");
      const user = this.store.acceptIdentity(identity);
      this.issueSession(response, user.id);
      json(response, 200, { ok: true });
      return true;
    }
    const current = this.session(request);
    if (!current) throw new HttpError(401, "Sign in to continue.");
    if (path === "/api/auth/logout") {
      this.store.revokeSession(current.id, current.userId);
      setCookie(response, this.sessionName, "", 0, this.secure);
      json(response, 200, { ok: true });
      return true;
    }
    if (path === "/api/auth/sessions/revoke") {
      const parsed = z.object({ id: z.uuid() }).safeParse(input);
      if (!parsed.success) throw new HttpError(400, "Invalid session ID.");
      const changes = this.store.revokeSession(parsed.data.id, current.userId);
      if (changes !== 1) throw new HttpError(404, "Session not found.");
      if (parsed.data.id === current.id)
        setCookie(response, this.sessionName, "", 0, this.secure);
      json(response, 200, { ok: true });
      return true;
    }
    if (
      path === "/api/auth/access/invite" ||
      path === "/api/auth/access/revoke"
    ) {
      if (this.store.user(current.userId)?.role !== "owner")
        throw new HttpError(403, "Only the owner can manage access.");
      const parsed = emailSchema.safeParse(input);
      if (!parsed.success)
        throw new HttpError(400, "Enter a valid email address.");
      if (parsed.data.email === this.config.OWNER_EMAIL)
        throw new HttpError(400, "The owner account cannot be changed here.");
      this.store.updateAccess(parsed.data.email, path.endsWith("/invite"));
      this.challenges.clear();
      json(response, 200, { ok: true });
      return true;
    }
    throw new HttpError(404, "Endpoint not found.");
  }
}
