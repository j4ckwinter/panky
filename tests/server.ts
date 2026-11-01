import type { GoogleIdentity } from "../apps/server/src/google.js";
import { loadConfig } from "../apps/server/src/config.js";
import { createApp } from "../apps/server/src/http.js";

const config = loadConfig({
  AUTH_TOKEN: "panky-browser-test-token-never-use-in-production",
  PORT: "3101",
  DATABASE_PATH: ":memory:",
  AUTH_ORIGIN: "http://localhost:5174",
  ALLOWED_ORIGINS: "http://localhost:5174",
  OWNER_EMAIL: "owner@gmail.com",
  GOOGLE_CLIENT_ID: "123456789-browser-tests.apps.googleusercontent.com",
  MODEL_PROVIDER: "mock",
});
const app = createApp(
  config,
  undefined,
  undefined,
  async (credential) => JSON.parse(credential) as GoogleIdentity,
);
app.server.listen(3101, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
