import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "./config-schema.ts";

const validEnvironment = {
  DATABASE_URL: "postgresql://user:password@example.com/database",
  GROQ_API_KEY: "groq-test-key",
  EXA_API_KEY: "exa-test-key",
  CHAT_MODEL: "chat-model",
  FAST_MODEL: "fast-model",
  COOKIE_SECRET: "a-cookie-secret-with-at-least-32-characters",
  NODE_ENV: "test",
};

test("parses the complete environment contract", () => {
  assert.deepEqual(parseConfig(validEnvironment), validEnvironment);
});

test("reports every missing required variable", () => {
  assert.throws(
    () => parseConfig({}),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DATABASE_URL/);
      assert.match(error.message, /GROQ_API_KEY/);
      assert.match(error.message, /EXA_API_KEY/);
      assert.match(error.message, /COOKIE_SECRET/);
      return true;
    },
  );
});

test("rejects placeholder API keys", () => {
  assert.throws(
    () => parseConfig({ ...validEnvironment, GROQ_API_KEY: "gsk-replace-me" }),
    /GROQ_API_KEY: must not be a placeholder/,
  );
});

test("requires complete embedding configuration when enabled", () => {
  assert.throws(
    () =>
      parseConfig({
        ...validEnvironment,
        EMBEDDING_MODEL: "embedding-model",
      }),
    /EMBEDDING_API_KEY, EMBEDDING_BASE_URL, and EMBEDDING_MODEL must be set together/,
  );
});
