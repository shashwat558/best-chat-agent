import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "../db/client";
import { dailyDigests, messages, userProfiles } from "../db/schema";
import { embedText } from "../embeddings";
import { localCalendarDay, localDayToUtcRange } from "../time";

export type DigestMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

export async function runDigest(input: Readonly<{
  userId: string;
  at: Date;
  summarize: (input: Readonly<{
    day: string;
    timezone: string;
    messages: DigestMessage[];
  }>) => Promise<string>;
}>) {
  const [profile] = await db
    .select({ timezone: userProfiles.timezone })
    .from(userProfiles)
    .where(eq(userProfiles.userId, input.userId))
    .limit(1);
  const timezone = profile?.timezone ?? "UTC";
  const day = localCalendarDay(input.at, timezone);
  const range = localDayToUtcRange(day, timezone);
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.userId, input.userId),
        gte(messages.createdAt, range.from),
        lt(messages.createdAt, range.to),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(100);
  if (rows.length === 0) return { day, messageCount: 0 };
  const summary = await input.summarize({ day, timezone, messages: rows });
  let embedding: number[] | null = null;
  try {
    embedding = await embedText(summary);
  } catch {
    embedding = null;
  }
  await db
    .insert(dailyDigests)
    .values({
      userId: input.userId,
      day,
      summary,
      embedding,
      messageCount: rows.length,
    })
    .onConflictDoUpdate({
      target: [dailyDigests.userId, dailyDigests.day],
      set: {
        summary,
        embedding,
        messageCount: rows.length,
        updatedAt: new Date(),
      },
    });
  return { day, messageCount: rows.length };
}
