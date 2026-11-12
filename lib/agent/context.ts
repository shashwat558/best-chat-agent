import {
  and,
  asc,
  cosineDistance,
  eq,
  isNotNull,
  isNull,
  lt,
} from "drizzle-orm";
import { loadRecentMessages } from "../chat-store";
import { db } from "../db/client";
import { userFacts, userProfiles } from "../db/schema";
import { embedText } from "../embeddings";
import { hashUserId, logStructured } from "../logger";
import { formatCurrentTime } from "../time";
import type { AgentMessage } from "./run";

const MAX_FACT_DISTANCE = 0.65;

export type AgentContext = Readonly<{
  now: Date;
  renderedNow: string;
  timezone: string;
  profile: string;
  facts: string[];
  history: AgentMessage[];
}>;

export async function buildAgentContext(input: Readonly<{
  userId: string;
  conversationId: string;
  latestMessage: string;
  timezone: string;
  now?: Date;
  embedQuery?: (text: string) => Promise<number[]>;
}>): Promise<AgentContext> {
  const now = input.now ?? new Date();
  const profilePromise = db
    .select({ profileText: userProfiles.profileText })
    .from(userProfiles)
    .where(eq(userProfiles.userId, input.userId))
    .limit(1);
  const historyPromise = loadRecentMessages(
    input.conversationId,
    input.userId,
    12,
  );
  const factsPromise = (async () => {
    try {
      const embedding = await (input.embedQuery ?? embedText)(input.latestMessage);
      const distance = cosineDistance(userFacts.embedding, embedding);
      return await db
        .select({ factText: userFacts.factText })
        .from(userFacts)
        .where(
          and(
            eq(userFacts.userId, input.userId),
            isNull(userFacts.supersededBy),
            isNull(userFacts.deletedAt),
            isNotNull(userFacts.embedding),
            lt(distance, MAX_FACT_DISTANCE),
          ),
        )
        .orderBy(asc(distance))
        .limit(5);
    } catch (error) {
      logStructured("warn", "memory_context_degraded", {
        userHash: hashUserId(input.userId),
        reason: "embedding_or_retrieval_failed",
        error,
      });
      return [];
    }
  })();

  const [profileRows, historyRows, factRows] = await Promise.all([
    profilePromise,
    historyPromise,
    factsPromise,
  ]);
  return {
    now,
    renderedNow: formatCurrentTime(now, input.timezone),
    timezone: input.timezone,
    profile: profileRows[0]?.profileText ?? "",
    facts: factRows.map((row) => row.factText),
    history: historyRows.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };
}
