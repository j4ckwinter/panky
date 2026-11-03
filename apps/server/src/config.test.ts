import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";

const base = {
  AUTH_TOKEN: "test-token-at-least-thirty-two-characters",
  MODEL_PROVIDER: "ollama",
  MODEL_NAME: "qwen3:4b",
};

test("Notion OAuth requires complete configuration and validates the encryption key without leaking it", () => {
  const oauth = {
    NOTION_CLIENT_ID: "a2e473df-ce40-43eb-866c-679ff8f9ef27",
    NOTION_CLIENT_SECRET: "private-client-secret",
    NOTION_TOKEN_KEY: "a".repeat(64),
    GOOGLE_CLIENT_ID: "123-test.apps.googleusercontent.com",
    OWNER_EMAIL: "owner@gmail.com",
  };
  assert.equal(
    loadConfig({ ...base, ...oauth }).NOTION_TOKEN_KEY,
    oauth.NOTION_TOKEN_KEY,
  );
  for (const field of Object.keys(oauth)) {
    assert.throws(
      () => loadConfig({ ...base, ...oauth, [field]: "" }),
      /Invalid server configuration/,
    );
  }
  assert.throws(
    () =>
      loadConfig({ ...base, ...oauth, NOTION_TOKEN_KEY: "private-short-key" }),
    (error) =>
      error instanceof Error &&
      error.message.includes("NOTION_TOKEN_KEY") &&
      !error.message.includes("private-short-key"),
  );
});

test("optional Notion credentials validate without exposing values", () => {
  assert.equal(
    loadConfig({ ...base, NOTION_TOKEN: "" }).NOTION_TOKEN,
    undefined,
  );
  for (const value of [
    "private token with whitespace",
    "private-secret\nheader:bad",
    "short",
  ]) {
    assert.throws(
      () => loadConfig({ ...base, NOTION_TOKEN: value }),
      (error) =>
        error instanceof Error &&
        error.message.includes("NOTION_TOKEN") &&
        !error.message.includes(value),
    );
  }
});

test("Ollama accepts numeric loopback origins and bounded context configuration", () => {
  for (const endpoint of [
    "http://127.0.0.1:11434",
    "http://[::1]:11434/",
    "http://127.0.0.1:4321",
  ]) {
    const config = loadConfig({ ...base, MODEL_ENDPOINT: endpoint });
    assert.equal(config.MODEL_ENDPOINT, endpoint);
    assert.equal(config.MODEL_CONTEXT_LENGTH, 4096);
  }
  for (const length of ["0", "2047", "8193", "4096.5", "NaN"]) {
    assert.throws(
      () => loadConfig({ ...base, MODEL_CONTEXT_LENGTH: length }),
      /MODEL_CONTEXT_LENGTH/,
    );
  }
});

test("Ollama rejects remote, hostname, credentialed and non-origin endpoints", () => {
  for (const endpoint of [
    "http://localhost:11434",
    "http://ollama.com",
    "https://127.0.0.1:11434",
    "http://192.168.1.2:11434",
    "http://0.0.0.0:11434",
    "http://[::]:11434",
    "http://user:secret@127.0.0.1:11434",
    "http://127.0.0.1:11434/api",
    "http://127.0.0.1:11434?token=secret",
    "http://127.0.0.1:11434#fragment",
    "file:///tmp/ollama",
    "invalid",
  ]) {
    assert.throws(
      () => loadConfig({ ...base, MODEL_ENDPOINT: endpoint }),
      /MODEL_ENDPOINT/,
      endpoint,
    );
  }
});

test("Ollama requires an explicit local model while mock remains the default", () => {
  assert.equal(
    loadConfig({ AUTH_TOKEN: base.AUTH_TOKEN }).MODEL_PROVIDER,
    "mock",
  );
  for (const model of [
    undefined,
    "",
    "   ",
    "qwen3:cloud",
    "qwen3:cloud ",
    "gpt-oss:120b-cloud",
    "qwen3:CLOUD",
  ]) {
    assert.throws(
      () => loadConfig({ ...base, MODEL_NAME: model }),
      /MODEL_NAME/,
    );
  }
  assert.equal(loadConfig(base).MODEL_NAME, "qwen3:4b");
});
