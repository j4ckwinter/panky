import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const source =
  process.env.PANKY_PICKS_TEST_SOURCE ??
  join(tmpdir(), `panky-picks-browser-${randomUUID()}.json`);
process.env.PANKY_PICKS_TEST_SOURCE = source;
export default defineConfig({
  testDir: "./tests",
  testMatch: "picks-real.check.ts",
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx tests/picks-real-server.ts",
      port: 3101,
      env: { PANKY_PICKS_TEST_SOURCE: source },
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
