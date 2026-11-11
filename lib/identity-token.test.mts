import assert from "node:assert/strict";
import test from "node:test";
import { signIdentity, verifyIdentity } from "./identity-token.ts";

const secret = "a-secure-test-secret-with-at-least-32-characters";
const userId = "47a39ab4-776d-4c95-bc3b-694ff1879f5f";

test("round trips a signed anonymous identity", () => {
  assert.equal(verifyIdentity(signIdentity(userId, secret), secret), userId);
});

test("rejects a tampered anonymous identity", () => {
  const token = signIdentity(userId, secret);
  assert.equal(verifyIdentity(`${token}x`, secret), null);
});
