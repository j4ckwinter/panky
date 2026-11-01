import { z } from "zod";

const originSchema = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
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
  MODEL_PROVIDER: z.enum(["mock", "ollama"]).default("mock"),
  MODEL_NAME: z.string().trim().min(1).max(100).default("panky-mock"),
  MAX_TASK_STEPS: z.coerce.number().int().min(1).max(32).default(8),
  HISTORY_MAX_CHARS: z.coerce
    .number()
    .int()
    .min(8000)
    .max(128000)
    .default(16000),
  MAX_TASK_DURATION_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(300000)
    .default(30000),
  MODEL_CONTEXT_LENGTH: z.coerce
    .number()
    .int()
    .min(2048)
    .max(8192)
    .default(4096),
  MODEL_ENDPOINT: z
    .url()
    .default("http://127.0.0.1:11434")
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        url.protocol === "http:" &&
        ["127.0.0.1", "[::1]"].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    }, "Ollama must use a private loopback HTTP origin."),
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
  if (
    result.data.MODEL_PROVIDER === "ollama" &&
    (!env.MODEL_NAME || /(?:^|[:-])cloud$/i.test(result.data.MODEL_NAME))
  ) {
    throw new Error(
      "Invalid server configuration: MODEL_NAME must name an explicitly selected local Ollama model. See .env.example.",
    );
  }
  return result.data;
}
