import { writeFile, rm } from "node:fs/promises";
import { createApp } from "../apps/server/src/http.js";
import { loadConfig } from "../apps/server/src/config.js";
import type { GoogleIdentity } from "../apps/server/src/auth/google.js";
import { realPicksSource } from "./picks-real-fixture.js";

const sourcePath = process.env.PANKY_PICKS_TEST_SOURCE;
if (!sourcePath) throw new Error("Missing isolated Picks source path.");
await writeFile(
  sourcePath,
  JSON.stringify(realPicksSource(new Date("2026-11-05T12:00:00Z"))),
);
const app = createApp(
  loadConfig({
    AUTH_TOKEN: "panky-browser-test-token-never-use-in-production",
    DATABASE_PATH: ":memory:",
    AUTH_ORIGIN: "http://localhost:5174",
    ALLOWED_ORIGINS: "http://localhost:5174",
    OWNER_EMAIL: "owner@gmail.com",
    GOOGLE_CLIENT_ID: "123456789-browser-tests.apps.googleusercontent.com",
    MODEL_PROVIDER: "mock",
    PICKS_DATA_PATH: sourcePath,
  }),
  undefined,
  undefined,
  async (credential) => JSON.parse(credential) as GoogleIdentity,
  undefined,
  undefined,
  undefined,
  undefined,
  () => new Date("2026-11-05T12:00:00Z"),
);
app.server.listen(3101, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().finally(() => rm(sourcePath, { force: true }));
  });
}
