import { defineConfig, devices } from "@playwright/test";

const token = "panky-browser-test-token-never-use-in-production";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx tests/server.ts",
      port: 3101,
      env: {
        AUTH_TOKEN: token,
        PORT: "3101",
        DATABASE_PATH: ":memory:",
        AUTH_ORIGIN: "http://localhost:5174",
        ALLOWED_ORIGINS: "http://localhost:5174",
        MODEL_PROVIDER: "mock",
      },
      reuseExistingServer: false,
    },
    {
      command:
        "pnpm --filter @panky/web dev --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { PANKY_API_TARGET: "http://127.0.0.1:3101" },
      reuseExistingServer: false,
    },
  ],
});
