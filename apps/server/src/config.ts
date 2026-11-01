import { z } from "zod";

const originSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value;
  }, "Origins must be exact HTTP(S) origins without paths or credentials.");

const configSchema = z.object({
  AUTH_TOKEN: z
    .string()
    .min(32)
    .regex(/^[A-Za-z0-9._~+/-]+=*$/),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_PATH: z.string().min(1).default("./data/panky.sqlite"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(originSchema).min(1)),
  MODEL_PROVIDER: z.literal("mock").default("mock"),
  MODEL_NAME: z.string().trim().min(1).max(100).default("panky-mock"),
  MODEL_ENDPOINT: z.url().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid server configuration: ${fields.join(", ")}. See .env.example.`,
    );
  }
  return result.data;
}
