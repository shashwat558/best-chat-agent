import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimit } from "./rate-limit.ts";

test("limits a user inside a fixed window and resets afterward", () => {
  const key = `test-${crypto.randomUUID()}`;
  const first = checkRateLimit(key, { limit: 2, windowMs: 1_000, now: 0 });
  const second = checkRateLimit(key, { limit: 2, windowMs: 1_000, now: 100 });
  const blocked = checkRateLimit(key, { limit: 2, windowMs: 1_000, now: 200 });
  const reset = checkRateLimit(key, { limit: 2, windowMs: 1_000, now: 1_000 });

  assert.deepEqual(
    [first.allowed, second.allowed, blocked.allowed, reset.allowed],
    [true, true, false, true],
  );
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 1);
});
