import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const userIdSchema = z.uuid();
const signedIdentitySchema = z.string().min(1).max(256);

function signatureFor(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("base64url");
}

export function signIdentity(userId: string, secret: string): string {
  const validUserId = userIdSchema.parse(userId);
  return `${validUserId}.${signatureFor(validUserId, secret)}`;
}

export function verifyIdentity(
  signedIdentity: string | undefined,
  secret: string,
): string | null {
  const parsed = signedIdentitySchema.safeParse(signedIdentity);
  if (!parsed.success) {
    return null;
  }

  const separator = parsed.data.lastIndexOf(".");
  if (separator < 1) {
    return null;
  }

  const userId = parsed.data.slice(0, separator);
  const signature = parsed.data.slice(separator + 1);
  if (!userIdSchema.safeParse(userId).success) {
    return null;
  }

  const expected = Buffer.from(signatureFor(userId, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) {
    return null;
  }

  return timingSafeEqual(expected, received) ? userId : null;
}
