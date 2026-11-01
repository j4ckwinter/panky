import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { HttpError } from "./chat.js";
import type { Config } from "./config.js";
import {
  type GoogleIdentity,
  type GoogleVerifier,
  googleIdentitySchema,
  verifyGoogleIdentity,
} from "./google.js";

export type AuthUser = { id: string; email: string; role: "owner" | "member" };
const lifetime = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  role: z.enum(["owner", "member"]),
  subject: z.string().nullable(),
  active: z.number(),
});
const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
});
const emailSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
});

async function body(request: IncomingMessage): Promise<unknown> {
  if (
    request.headers["content-type"]?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new HttpError(415, "Use application/json.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of request) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
function cookie(request: IncomingMessage, name: string) {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return "";
  const value = values[0]?.slice(name.length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}
function json(response: ServerResponse, value: unknown) {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}
function publicUser(user: z.infer<typeof userSchema>): AuthUser {
  return { id: user.id, email: user.email, role: user.role };
}
type Challenge = { nonce: string; expiresAt: number; revision: number };

export class Auth {
  private readonly db: DatabaseSync;
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
    this.db = new DatabaseSync(config.DATABASE_PATH);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS google_auth_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO google_auth_meta VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS google_users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','member')),
        subject TEXT UNIQUE, active INTEGER NOT NULL CHECK(active IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS google_invites (email TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS google_sessions (
        id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES google_users(id),
        tokenHash TEXT UNIQUE NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS google_sessions_user ON google_sessions(userId);
    `);
    if (config.OWNER_EMAIL) {
      const owner = this.db
        .prepare("SELECT * FROM google_users WHERE id='owner'")
        .get();
      if (owner && owner.email !== config.OWNER_EMAIL) {
        this.db.close();
        throw new Error(
          "OWNER_EMAIL differs from the existing owner. Restore the configured owner email.",
        );
      }
      this.db
        .prepare(
          "INSERT OR IGNORE INTO google_users VALUES ('owner', ?, 'owner', NULL, 1)",
        )
        .run(config.OWNER_EMAIL);
    }
  }
  close() {
    this.db.close();
  }
  private revision() {
    return Number(
      this.db
        .prepare("SELECT revision FROM google_auth_meta WHERE singleton=1")
        .get()?.revision,
    );
  }
  private configured() {
    return Boolean(this.config.GOOGLE_CLIENT_ID && this.config.OWNER_EMAIL);
  }
  private setCookie(
    response: ServerResponse,
    name: string,
    value: string,
    maxAge: number,
  ) {
    const item = `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.secure ? "; Secure" : ""}`;
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
  private session(request: IncomingMessage) {
    const value = cookie(request, this.sessionName);
    if (!value) return null;
    this.db
      .prepare("DELETE FROM google_sessions WHERE expiresAt <= ?")
      .run(Date.now());
    const row = this.db
      .prepare(
        "SELECT s.* FROM google_sessions s JOIN google_users u ON u.id=s.userId WHERE s.tokenHash=? AND u.active=1",
      )
      .get(hash(value));
    return row ? sessionSchema.parse(row) : null;
  }
  private user(id: string) {
    const row = this.db
      .prepare("SELECT * FROM google_users WHERE id=? AND active=1")
      .get(id);
    return row ? userSchema.parse(row) : null;
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
    const user = session && this.user(session.userId);
    return user ? publicUser(user) : null;
  }
  private issueSession(response: ServerResponse, userId: string) {
    const now = Date.now();
    const secret = randomBytes(32).toString("base64url");
    this.db
      .prepare("DELETE FROM google_sessions WHERE expiresAt <= ?")
      .run(now);
    this.db
      .prepare("INSERT INTO google_sessions VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), userId, hash(secret), now, now + lifetime);
    this.db
      .prepare(
        "DELETE FROM google_sessions WHERE userId=? AND id NOT IN (SELECT id FROM google_sessions WHERE userId=? ORDER BY createdAt DESC, rowid DESC LIMIT 100)",
      )
      .run(userId, userId);
    this.setCookie(response, this.sessionName, secret, lifetime / 1000);
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
    this.challenges.delete(hash(cookie(request, this.challengeName)));
    if (this.challenges.size >= 100)
      throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    const secret = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    this.challenges.set(hash(secret), {
      nonce,
      expiresAt: Date.now() + 300000,
      revision: this.revision(),
    });
    this.setCookie(response, this.challengeName, secret, 300);
    return nonce;
  }
  private takeChallenge(request: IncomingMessage, response: ServerResponse) {
    const key = hash(cookie(request, this.challengeName));
    const challenge = this.challenges.get(key);
    this.challenges.delete(key);
    this.setCookie(response, this.challengeName, "", 0);
    if (
      !challenge ||
      challenge.expiresAt <= Date.now() ||
      challenge.revision !== this.revision()
    )
      throw new HttpError(401, "Sign-in expired. Start again.");
    return challenge;
  }
  private acceptIdentity(identity: GoogleIdentity): AuthUser {
    const domain = identity.email.split("@")[1];
    if (
      domain !== "gmail.com" &&
      (!identity.hd || identity.hd.toLowerCase() !== domain)
    )
      throw new HttpError(
        403,
        "Use a Gmail or Google Workspace account with a verified email.",
      );
    const bySubject = this.db
      .prepare("SELECT * FROM google_users WHERE subject=?")
      .get(identity.sub);
    if (bySubject) {
      const user = userSchema.parse(bySubject);
      if (!user.active || user.email !== identity.email)
        throw new HttpError(403, "This account does not have access.");
      return publicUser(user);
    }
    const row = this.db
      .prepare("SELECT * FROM google_users WHERE email=?")
      .get(identity.email);
    if (row) {
      const user = userSchema.parse(row);
      if (!user.active || user.subject !== null)
        throw new HttpError(403, "This account does not have access.");
      this.db
        .prepare(
          "UPDATE google_users SET subject=? WHERE id=? AND subject IS NULL",
        )
        .run(identity.sub, user.id);
      return publicUser(user);
    }
    if (
      !this.db
        .prepare("SELECT email FROM google_invites WHERE email=?")
        .get(identity.email)
    )
      throw new HttpError(403, "This account has not been invited.");
    const user: AuthUser = {
      id: randomUUID(),
      email: identity.email,
      role: "member",
    };
    this.db
      .prepare("INSERT INTO google_users VALUES (?, ?, 'member', ?, 1)")
      .run(user.id, user.email, identity.sub);
    return user;
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
      json(response, {
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
      json(response, {
        sessions: this.db
          .prepare(
            "SELECT * FROM google_sessions WHERE userId=? ORDER BY createdAt DESC",
          )
          .all(current.userId)
          .map((row) => {
            const session = sessionSchema.parse(row);
            return {
              id: session.id,
              createdAt: new Date(session.createdAt).toISOString(),
              expiresAt: new Date(session.expiresAt).toISOString(),
              current: session.id === current.id,
            };
          }),
      });
      return true;
    }
    if (path === "/api/auth/access" && request.method === "GET") {
      if (this.authenticate(request)?.role !== "owner")
        throw new HttpError(403, "Only the owner can manage access.");
      json(response, {
        invites: this.db
          .prepare("SELECT email FROM google_invites ORDER BY email")
          .all(),
        users: this.db
          .prepare(
            "SELECT id,email,role,active FROM google_users ORDER BY email",
          )
          .all()
          .map((row) => ({ ...row, active: row.active === 1 })),
      });
      return true;
    }
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    if (request.headers.origin !== this.config.AUTH_ORIGIN)
      throw new HttpError(403, "Origin is required for sign-in.");
    this.limit();
    const input = await body(request);
    if (path === "/api/auth/google/options") {
      if (!this.configured())
        throw new HttpError(
          503,
          "Google sign-in is not configured on this backend.",
        );
      json(response, {
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
        challenge.revision !== this.revision()
      )
        throw new HttpError(401, "Sign-in expired. Start again.");
      const user = this.acceptIdentity(identity);
      this.issueSession(response, user.id);
      json(response, { ok: true });
      return true;
    }
    const current = this.session(request);
    if (!current) throw new HttpError(401, "Sign in to continue.");
    if (path === "/api/auth/logout") {
      this.db
        .prepare("DELETE FROM google_sessions WHERE id=? AND userId=?")
        .run(current.id, current.userId);
      this.setCookie(response, this.sessionName, "", 0);
      json(response, { ok: true });
      return true;
    }
    if (path === "/api/auth/sessions/revoke") {
      const parsed = z.object({ id: z.uuid() }).safeParse(input);
      if (!parsed.success) throw new HttpError(400, "Invalid session ID.");
      const result = this.db
        .prepare("DELETE FROM google_sessions WHERE id=? AND userId=?")
        .run(parsed.data.id, current.userId);
      if (result.changes !== 1) throw new HttpError(404, "Session not found.");
      if (parsed.data.id === current.id)
        this.setCookie(response, this.sessionName, "", 0);
      json(response, { ok: true });
      return true;
    }
    if (
      path === "/api/auth/access/invite" ||
      path === "/api/auth/access/revoke"
    ) {
      if (this.user(current.userId)?.role !== "owner")
        throw new HttpError(403, "Only the owner can manage access.");
      const parsed = emailSchema.safeParse(input);
      if (!parsed.success)
        throw new HttpError(400, "Enter a valid email address.");
      if (parsed.data.email === this.config.OWNER_EMAIL)
        throw new HttpError(400, "The owner account cannot be changed here.");
      this.db.exec("BEGIN IMMEDIATE");
      try {
        if (path.endsWith("/invite")) {
          this.db
            .prepare("INSERT OR IGNORE INTO google_invites VALUES (?)")
            .run(parsed.data.email);
          this.db
            .prepare(
              "UPDATE google_users SET active=1 WHERE email=? AND role='member'",
            )
            .run(parsed.data.email);
        } else {
          this.db
            .prepare("DELETE FROM google_invites WHERE email=?")
            .run(parsed.data.email);
          this.db
            .prepare(
              "UPDATE google_users SET active=0 WHERE email=? AND role='member'",
            )
            .run(parsed.data.email);
          this.db
            .prepare(
              "DELETE FROM google_sessions WHERE userId IN (SELECT id FROM google_users WHERE email=? AND role='member')",
            )
            .run(parsed.data.email);
        }
        this.db.exec(
          "UPDATE google_auth_meta SET revision=revision+1 WHERE singleton=1; COMMIT;",
        );
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      this.challenges.clear();
      json(response, { ok: true });
      return true;
    }
    throw new HttpError(404, "Endpoint not found.");
  }
}
