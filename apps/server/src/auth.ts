import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { z } from "zod";
import { HttpError } from "./chat.js";
import type { Config } from "./config.js";

const lifetime = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sessionSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
});
const credentialSchema = z.object({
  id: z.string(),
  publicKey: z.string(),
  counter: z.number(),
});
const baseResponseSchema = z.object({
  id: z.string().min(1).max(2048),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  clientExtensionResults: z.object({
    credProps: z.object({ rk: z.boolean().optional() }).optional(),
  }),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});
const registrationSchema = z.object({
  response: baseResponseSchema.extend({
    response: z.object({
      clientDataJSON: z.string().min(1),
      attestationObject: z.string().min(1),
      transports: z.array(z.string()).optional(),
    }),
  }),
});
const authenticationSchema = z.object({
  response: baseResponseSchema.extend({
    response: z.object({
      clientDataJSON: z.string().min(1),
      authenticatorData: z.string().min(1),
      signature: z.string().min(1),
      userHandle: z.string().optional(),
    }),
  }),
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

type Challenge = {
  challenge: string;
  kind: "register" | "login";
  expiresAt: number;
  epoch: number;
};
export class Auth {
  private readonly db: DatabaseSync;
  private readonly challenges = new Map<string, Challenge>();
  private readonly origin: string;
  private readonly rpID: string;
  private readonly secure: boolean;
  private readonly sessionName: string;
  private readonly challengeName: string;
  private rate = { start: 0, count: 0 };
  private failures = { start: 0, count: 0 };

  constructor(private readonly config: Config) {
    this.origin = config.AUTH_ORIGIN;
    const url = new URL(this.origin);
    this.rpID = url.hostname;
    this.secure = url.protocol === "https:";
    this.sessionName = this.secure ? "__Host-panky-session" : "panky-session";
    this.challengeName = this.secure
      ? "__Host-panky-challenge"
      : "panky-challenge";
    this.db = new DatabaseSync(config.DATABASE_PATH);
    this.db.exec(`CREATE TABLE IF NOT EXISTS auth_owner (singleton INTEGER PRIMARY KEY CHECK(singleton=1), epoch INTEGER NOT NULL);
      INSERT OR IGNORE INTO auth_owner VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS auth_credentials (id TEXT PRIMARY KEY, publicKey TEXT NOT NULL, counter INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY, tokenHash TEXT UNIQUE NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  private epoch() {
    return Number(
      this.db.prepare("SELECT epoch FROM auth_owner WHERE singleton=1").get()
        ?.epoch,
    );
  }
  private configured() {
    return Boolean(
      this.db.prepare("SELECT id FROM auth_credentials LIMIT 1").get(),
    );
  }
  private setCookie(
    response: ServerResponse,
    name: string,
    value: string,
    maxAge: number,
  ) {
    const valueString = `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.secure ? "; Secure" : ""}`;
    const previous = response.getHeader("Set-Cookie");
    response.setHeader("Set-Cookie", [
      ...(Array.isArray(previous)
        ? previous
        : previous
          ? [String(previous)]
          : []),
      valueString,
    ]);
  }
  private session(request: IncomingMessage) {
    const value = cookie(request, this.sessionName);
    if (!value) return null;
    this.db
      .prepare("DELETE FROM auth_sessions WHERE expiresAt <= ?")
      .run(Date.now());
    const row = this.db
      .prepare(
        "SELECT id, createdAt, expiresAt FROM auth_sessions WHERE tokenHash = ?",
      )
      .get(hash(value));
    return row ? sessionSchema.parse(row) : null;
  }
  authenticate(request: IncomingMessage) {
    if (request.headers.origin && request.headers.origin !== this.origin)
      return false;
    if (request.method !== "GET" && request.headers.origin !== this.origin)
      return false;
    if (request.headers["sec-fetch-site"] === "cross-site") return false;
    return this.session(request) !== null;
  }
  private issueSession(response: ServerResponse) {
    const now = Date.now();
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM auth_sessions WHERE expiresAt <= ?").run(now);
    this.db
      .prepare("INSERT INTO auth_sessions VALUES (?, ?, ?, ?)")
      .run(randomUUID(), hash(token), now, now + lifetime);
    this.db.exec(
      "DELETE FROM auth_sessions WHERE id NOT IN (SELECT id FROM auth_sessions ORDER BY createdAt DESC, rowid DESC LIMIT 100)",
    );
    this.setCookie(response, this.sessionName, token, lifetime / 1000);
  }
  private limit(bucket: { start: number; count: number }, maximum: number) {
    if (Date.now() - bucket.start > 60_000) {
      bucket.start = Date.now();
      bucket.count = 0;
    }
    if (++bucket.count > maximum)
      throw new HttpError(
        429,
        "Too many sign-in attempts. Try again in a minute.",
      );
  }
  private checkToken(input: unknown) {
    const parsed = z
      .object({ token: z.string().min(1).max(512) })
      .safeParse(input);
    if (!parsed.success) throw new HttpError(400, "Enter your recovery token.");
    if (Date.now() - this.failures.start <= 60_000 && this.failures.count >= 5)
      throw new HttpError(
        429,
        "Too many sign-in attempts. Try again in a minute.",
      );
    if (
      !timingSafeEqual(
        Buffer.from(hash(parsed.data.token)),
        Buffer.from(hash(this.config.AUTH_TOKEN)),
      )
    ) {
      this.limit(this.failures, 5);
      throw new HttpError(401, "Recovery token rejected.");
    }
  }
  private setChallenge(
    request: IncomingMessage,
    response: ServerResponse,
    challenge: string,
    kind: Challenge["kind"],
    epoch: number,
  ) {
    for (const [key, value] of this.challenges)
      if (value.expiresAt <= Date.now()) this.challenges.delete(key);
    this.challenges.delete(hash(cookie(request, this.challengeName)));
    if (this.challenges.size >= 100)
      throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    const token = randomBytes(32).toString("base64url");
    this.challenges.set(hash(token), {
      challenge,
      kind,
      epoch,
      expiresAt: Date.now() + 300_000,
    });
    this.setCookie(response, this.challengeName, token, 300);
  }
  private takeChallenge(
    request: IncomingMessage,
    response: ServerResponse,
    kind: Challenge["kind"],
  ) {
    const key = hash(cookie(request, this.challengeName));
    const value = this.challenges.get(key);
    this.challenges.delete(key);
    this.setCookie(response, this.challengeName, "", 0);
    if (
      !value ||
      value.kind !== kind ||
      value.expiresAt <= Date.now() ||
      value.epoch !== this.epoch()
    )
      throw new HttpError(401, "Sign-in expired. Start again.");
    return value;
  }

  async route(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
  ) {
    if (!path.startsWith("/api/auth/")) return false;
    if (request.headers.origin && request.headers.origin !== this.origin)
      throw new HttpError(403, "Use the configured sign-in origin.");
    if (request.headers["sec-fetch-site"] === "cross-site")
      throw new HttpError(403, "Cross-site sign-in is not allowed.");
    if (path === "/api/auth/status" && request.method === "GET") {
      json(response, {
        authenticated: this.authenticate(request),
        configured: this.configured(),
      });
      return true;
    }
    if (path === "/api/auth/sessions" && request.method === "GET") {
      const current = this.session(request);
      if (!current) throw new HttpError(401, "Sign in to manage devices.");
      json(response, {
        sessions: this.db
          .prepare(
            "SELECT id, createdAt, expiresAt FROM auth_sessions ORDER BY createdAt DESC",
          )
          .all()
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
    if (request.method !== "POST")
      throw new HttpError(405, "Method not allowed.");
    if (request.headers.origin !== this.origin)
      throw new HttpError(403, "Origin is required for sign-in.");
    this.limit(this.rate, 60);
    const input = await body(request);
    if (path === "/api/auth/register/options") {
      this.checkToken(input);
      if (this.configured())
        throw new HttpError(
          409,
          "A passkey is already registered. Sign in or recover access.",
        );
      const epoch = this.epoch();
      const options = await generateRegistrationOptions({
        rpName: "Panky",
        rpID: this.rpID,
        userName: "Panky owner",
        userID: new TextEncoder().encode("panky-owner"),
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      });
      this.setChallenge(
        request,
        response,
        options.challenge,
        "register",
        epoch,
      );
      json(response, options);
      return true;
    }
    if (path === "/api/auth/register/verify") {
      const challenge = this.takeChallenge(request, response, "register");
      const parsed = registrationSchema.safeParse(input);
      if (!parsed.success)
        throw new HttpError(400, "Invalid passkey response.");
      if (this.configured())
        throw new HttpError(409, "A passkey is already registered.");
      let result;
      try {
        result = await verifyRegistrationResponse({
          response: parsed.data.response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: this.origin,
          expectedRPID: this.rpID,
          requireUserVerification: true,
        });
      } catch {
        throw new HttpError(401, "Passkey verification failed.");
      }
      if (!result.verified || !result.registrationInfo)
        throw new HttpError(401, "Passkey verification failed.");
      if (challenge.epoch !== this.epoch() || this.configured())
        throw new HttpError(409, "Setup changed. Start again.");
      const credential = result.registrationInfo.credential;
      this.db
        .prepare("INSERT INTO auth_credentials VALUES (?, ?, ?)")
        .run(
          credential.id,
          Buffer.from(credential.publicKey).toString("base64url"),
          credential.counter,
        );
      this.challenges.clear();
      this.issueSession(response);
      json(response, { ok: true });
      return true;
    }
    if (path === "/api/auth/login/options") {
      if (!this.configured())
        throw new HttpError(409, "Set up your passkey first.");
      const epoch = this.epoch();
      const options = await generateAuthenticationOptions({
        rpID: this.rpID,
        userVerification: "required",
      });
      this.setChallenge(request, response, options.challenge, "login", epoch);
      json(response, options);
      return true;
    }
    if (path === "/api/auth/login/verify") {
      const challenge = this.takeChallenge(request, response, "login");
      const parsed = authenticationSchema.safeParse(input);
      if (!parsed.success)
        throw new HttpError(400, "Invalid passkey response.");
      const row = this.db
        .prepare("SELECT * FROM auth_credentials WHERE id = ?")
        .get(parsed.data.response.id);
      if (!row) throw new HttpError(401, "Passkey verification failed.");
      const credential = credentialSchema.parse(row);
      let result;
      try {
        result = await verifyAuthenticationResponse({
          response: parsed.data.response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: this.origin,
          expectedRPID: this.rpID,
          credential: {
            ...credential,
            publicKey: Buffer.from(credential.publicKey, "base64url"),
          },
          requireUserVerification: true,
        });
      } catch {
        throw new HttpError(401, "Passkey verification failed.");
      }
      if (!result.verified || challenge.epoch !== this.epoch())
        throw new HttpError(401, "Passkey verification failed.");
      const updated = this.db
        .prepare(
          "UPDATE auth_credentials SET counter = ? WHERE id = ? AND counter = ?",
        )
        .run(
          result.authenticationInfo.newCounter,
          credential.id,
          credential.counter,
        );
      if (updated.changes !== 1)
        throw new HttpError(401, "Sign-in changed. Start again.");
      this.issueSession(response);
      json(response, { ok: true });
      return true;
    }
    if (path === "/api/auth/recover") {
      this.checkToken(input);
      this.db.exec(
        "BEGIN IMMEDIATE; DELETE FROM auth_credentials; DELETE FROM auth_sessions; UPDATE auth_owner SET epoch=epoch+1 WHERE singleton=1; COMMIT;",
      );
      this.challenges.clear();
      this.setCookie(response, this.sessionName, "", 0);
      this.setCookie(response, this.challengeName, "", 0);
      json(response, { ok: true });
      return true;
    }
    const current = this.session(request);
    if (!current) throw new HttpError(401, "Sign in to manage devices.");
    if (path === "/api/auth/logout") {
      this.db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(current.id);
      this.setCookie(response, this.sessionName, "", 0);
      json(response, { ok: true });
      return true;
    }
    if (path === "/api/auth/sessions/revoke") {
      const parsed = z.object({ id: z.uuid() }).safeParse(input);
      if (!parsed.success) throw new HttpError(400, "Invalid session ID.");
      this.db
        .prepare("DELETE FROM auth_sessions WHERE id = ?")
        .run(parsed.data.id);
      if (parsed.data.id === current.id)
        this.setCookie(response, this.sessionName, "", 0);
      json(response, { ok: true });
      return true;
    }
    throw new HttpError(404, "Endpoint not found.");
  }
}
