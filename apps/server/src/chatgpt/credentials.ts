import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const secret = z.string().min(1).max(32768);
export const credentialSchema = z.object({
  clientId: z
    .string()
    .min(1)
    .max(256)
    .refine((id) => id !== "dynamic_agent_client"),
  subject: z.string().min(1).max(256),
  email: z.email().max(320),
  accessToken: secret,
  refreshToken: secret,
  idToken: secret,
  scopes: z.array(z.string().max(100)).max(30),
  expiresAt: z.number().int().positive(),
});
export type Credential = z.infer<typeof credentialSchema>;
const execute = promisify(execFile);

export async function protect(path: string) {
  if (process.platform === "win32") {
    const { stdout } = await execute("whoami.exe", []);
    const identity = stdout.trim();
    if (!identity || /[\r\n]/u.test(identity))
      throw new Error("Cannot protect ChatGPT credentials.");
    await execute("icacls.exe", [
      path,
      "/inheritance:r",
      "/grant:r",
      `${identity}:(F)`,
    ]);
  } else await chmod(path, 0o600);
}

export async function atomicWrite(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await protect(temporary);
    await file.writeFile(JSON.stringify(value));
    await file.sync();
    await file.close();
    await rename(temporary, path);
  } finally {
    await file.close().catch(() => undefined);
    await rm(temporary, { force: true });
  }
}

export async function readCredential(path: string): Promise<Credential | null> {
  try {
    const info = await stat(path);
    if (
      info.size > 131072 ||
      (process.platform !== "win32" && (info.mode & 0o077) !== 0)
    )
      throw new Error("ChatGPT credential storage is not protected.");
    return credentialSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw new Error(
      "ChatGPT credentials could not be read. Reconnect locally.",
    );
  }
}

export async function withCredentialLock<T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = `${path}.lock`;
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
  } catch {
    throw new Error(
      "ChatGPT credentials are busy. Finish the other operation first.",
    );
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
}

export async function hostId(path: string): Promise<string> {
  const hostPath = `${path}.host`;
  try {
    return z
      .string()
      .regex(/^urn:uuid:[a-f0-9-]{36}$/u)
      .parse(JSON.parse(await readFile(hostPath, "utf8")));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw new Error("ChatGPT host identity could not be read.");
    const id = `urn:uuid:${randomUUID()}`;
    await atomicWrite(hostPath, id);
    return id;
  }
}
