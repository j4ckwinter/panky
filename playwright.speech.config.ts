import { defineConfig } from "@playwright/test";
import base from "./playwright.production.config.js";

export default defineConfig({
  ...base,
  testMatch: "speech-model.check.ts",
  timeout: 120_000,
});
