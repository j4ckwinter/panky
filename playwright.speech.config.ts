import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

export default defineConfig({
  ...base,
  testMatch: "speech-model.check.ts",
  timeout: 120_000,
  webServer: [
    ...(Array.isArray(base.webServer) ? base.webServer.slice(0, 1) : []),
    {
      command:
        "pnpm --filter @panky/web preview --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { PANKY_API_TARGET: "http://127.0.0.1:3101" },
      reuseExistingServer: false,
    },
  ],
});
