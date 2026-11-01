import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AuthUser } from "@panky/shared";
import { z } from "zod";
import { HttpError } from "../http-utils.js";
import { hashSecret } from "./credentials.js";
import type { GoogleIdentity } from "./google.js";

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
function publicUser(user: z.infer<typeof userSchema>): AuthUser {
  return { id: user.id, email: user.email, role: user.role };
}
export class AuthStore {
  private readonly db: DatabaseSync;
  constructor(path: string, ownerEmail: string | undefined) {
    this.db = new DatabaseSync(path);
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
    if (ownerEmail) {
      const owner = this.db
        .prepare("SELECT * FROM google_users WHERE id='owner'")
        .get();
      if (owner && owner.email !== ownerEmail) {
        this.db.close();
        throw new Error(
          "OWNER_EMAIL differs from the existing owner. Restore the configured owner email.",
        );
      }
      this.db
        .prepare(
          "INSERT OR IGNORE INTO google_users VALUES ('owner', ?, 'owner', NULL, 1)",
        )
        .run(ownerEmail);
    }
  }
  close() {
    this.db.close();
  }
  revision() {
    return Number(
      this.db
        .prepare("SELECT revision FROM google_auth_meta WHERE singleton=1")
        .get()?.revision,
    );
  }
  session(secret: string) {
    if (!secret) return null;
    this.db
      .prepare("DELETE FROM google_sessions WHERE expiresAt <= ?")
      .run(Date.now());
    const row = this.db
      .prepare(
        "SELECT s.* FROM google_sessions s JOIN google_users u ON u.id=s.userId WHERE s.tokenHash=? AND u.active=1",
      )
      .get(hashSecret(secret));
    return row ? sessionSchema.parse(row) : null;
  }
  user(id: string) {
    const row = this.db
      .prepare("SELECT * FROM google_users WHERE id=? AND active=1")
      .get(id);
    return row ? publicUser(userSchema.parse(row)) : null;
  }
  issueSession(userId: string, secret: string, lifetime: number) {
    const now = Date.now();
    this.db
      .prepare("DELETE FROM google_sessions WHERE expiresAt <= ?")
      .run(now);
    this.db
      .prepare("INSERT INTO google_sessions VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), userId, hashSecret(secret), now, now + lifetime);
    this.db
      .prepare(
        "DELETE FROM google_sessions WHERE userId=? AND id NOT IN (SELECT id FROM google_sessions WHERE userId=? ORDER BY createdAt DESC, rowid DESC LIMIT 100)",
      )
      .run(userId, userId);
  }
  acceptIdentity(identity: GoogleIdentity): AuthUser {
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
  sessions(current: z.infer<typeof sessionSchema>) {
    return this.db
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
      });
  }
  access() {
    return {
      invites: this.db
        .prepare("SELECT email FROM google_invites ORDER BY email")
        .all(),
      users: this.db
        .prepare("SELECT id,email,role,active FROM google_users ORDER BY email")
        .all()
        .map((row) => ({ ...row, active: row.active === 1 })),
    };
  }
  revokeSession(id: string, userId: string) {
    return this.db
      .prepare("DELETE FROM google_sessions WHERE id=? AND userId=?")
      .run(id, userId).changes;
  }
  updateAccess(email: string, invite: boolean) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (invite) {
        this.db
          .prepare("INSERT OR IGNORE INTO google_invites VALUES (?)")
          .run(email);
        this.db
          .prepare(
            "UPDATE google_users SET active=1 WHERE email=? AND role='member'",
          )
          .run(email);
      } else {
        this.db.prepare("DELETE FROM google_invites WHERE email=?").run(email);
        this.db
          .prepare(
            "UPDATE google_users SET active=0 WHERE email=? AND role='member'",
          )
          .run(email);
        this.db
          .prepare(
            "DELETE FROM google_sessions WHERE userId IN (SELECT id FROM google_users WHERE email=? AND role='member')",
          )
          .run(email);
      }
      this.db.exec(
        "UPDATE google_auth_meta SET revision=revision+1 WHERE singleton=1; COMMIT;",
      );
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
