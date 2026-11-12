import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userFacts, userProfiles } from "@/lib/db/schema";
import { getUserId } from "@/lib/identity";
import { hashUserId, logStructured } from "@/lib/logger";
import { regenerateProfile } from "@/lib/memory/writer";
import {
  memoryDeleteRequestSchema,
  memoryListResponseSchema,
} from "@/lib/schemas";

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  const rows = await db
    .select({
      id: userFacts.id,
      factText: userFacts.factText,
      category: userFacts.category,
      aliases: userFacts.aliases,
      confidence: userFacts.confidence,
      lastConfirmedAt: userFacts.lastConfirmedAt,
    })
    .from(userFacts)
    .where(
      and(
        eq(userFacts.userId, userId),
        isNull(userFacts.supersededBy),
        isNull(userFacts.deletedAt),
      ),
    )
    .orderBy(desc(userFacts.lastConfirmedAt))
    .limit(100);

  const payload = memoryListResponseSchema.parse({
    facts: rows.map((row) => ({
      ...row,
      lastConfirmedAt: row.lastConfirmedAt.toISOString(),
    })),
  });
  return Response.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = memoryDeleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const userId = await getUserId();
  const [fact] = await db
    .select({ id: userFacts.id })
    .from(userFacts)
    .where(
      and(
        eq(userFacts.id, parsed.data.factId),
        eq(userFacts.userId, userId),
        isNull(userFacts.supersededBy),
        isNull(userFacts.deletedAt),
      ),
    )
    .limit(1);
  if (!fact) {
    return Response.json({ error: "memory_not_found" }, { status: 404 });
  }

  const now = new Date();
  await db.batch([
    db
      .update(userFacts)
      .set({ deletedAt: now })
      .where(
        and(
          eq(userFacts.id, fact.id),
          eq(userFacts.userId, userId),
          isNull(userFacts.deletedAt),
        ),
      ),
    db
      .update(userProfiles)
      .set({ profileText: "", updatedAt: now })
      .where(eq(userProfiles.userId, userId)),
  ]);

  try {
    await regenerateProfile(userId);
  } catch (error) {
    logStructured("warn", "profile_regeneration_degraded", {
      userHash: hashUserId(userId),
      reason: "memory_deleted",
      error,
    });
  }

  return Response.json({ deleted: true });
}
