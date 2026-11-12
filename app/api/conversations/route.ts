import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { getUserId } from "@/lib/identity";
import {
  conversationListQuerySchema,
  conversationListResponseSchema,
} from "@/lib/schemas";

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = conversationListQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const userId = await getUserId();
  const query = parsed.data.q;
  const pattern = query ? `%${escapeLikePattern(query)}%` : "";

  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(
      query
        ? and(
            eq(conversations.userId, userId),
            or(
              ilike(conversations.title, pattern),
              sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id} and ${ilike(messages.content, pattern)})`,
            ),
          )
        : eq(conversations.userId, userId),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(100);

  const payload = conversationListResponseSchema.parse({
    conversations: rows.map((row) => ({
      id: row.id,
      title: row.title ?? "",
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
  return Response.json(payload);
}
