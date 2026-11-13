import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { claims, userFacts, userProfiles } from "@/lib/db/schema";
import { getUserId } from "@/lib/identity";
import { hashUserId, logStructured } from "@/lib/logger";
import { regenerateProfile } from "@/lib/memory/writer";
import {
  memoryDeleteRequestSchema,
  memoryListResponseSchema,
} from "@/lib/schemas";

export async function GET(): Promise<Response> {
  const userId = await getUserId();
  const [factRows, claimRows] = await Promise.all([
    db
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
      .limit(100),
    db
      .select({
        id: claims.id,
        claimText: claims.claimText,
        status: claims.status,
        volatility: claims.volatility,
        observedAt: claims.observedAt,
        lastVerifiedAt: claims.lastVerifiedAt,
      })
      .from(claims)
      .where(eq(claims.userId, userId))
      .orderBy(desc(claims.observedAt))
      .limit(30),
  ]);

  const payload = memoryListResponseSchema.parse({
    facts: factRows.map((row) => ({
      ...row,
      lastConfirmedAt: row.lastConfirmedAt.toISOString(),
    })),
    claims: claimRows.map((row) => ({
      ...row,
      observedAt: row.observedAt.toISOString(),
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
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
