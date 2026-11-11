import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "./config";
import { signIdentity, verifyIdentity } from "./identity-token";

const IDENTITY_COOKIE = "chat_user";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export async function getUserId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = verifyIdentity(
    cookieStore.get(IDENTITY_COOKIE)?.value,
    config.COOKIE_SECRET,
  );

  if (existing) {
    return existing;
  }

  const userId = randomUUID();
  cookieStore.set(IDENTITY_COOKIE, signIdentity(userId, config.COOKIE_SECRET), {
    httpOnly: true,
    maxAge: ONE_YEAR_IN_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
  });

  return userId;
}
