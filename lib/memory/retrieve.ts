import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { db } from "../db/client";
import {
  claims,
  dailyDigests,
  messages,
  userFacts,
  type StoredSource,
} from "../db/schema";
import {
  recallKindSchema,
  type RecallItem,
  type RetrieveParams,
} from "./types";

export type { RecallItem, RetrieveParams } from "./types";

type RankedItem = Readonly<{ item: RecallItem; score: number }>;
type Candidate = Readonly<{
  item: RecallItem;
  channel: "vector" | "keyword" | "date";
  rank: number;
}>;

const CANDIDATE_LIMIT = 20;
const RRF_K = 60;

function timeConditions(
  column: SQLWrapper,
  from?: Date,
  to?: Date,
): SQL[] {
  return [
    ...(from ? [gte(column, from)] : []),
    ...(to ? [lt(column, to)] : []),
  ];
}

function fuse(candidates: Candidate[], limit: number): RecallItem[] {
  const fused = new Map<string, RankedItem>();
  for (const candidate of candidates) {
    const key = `${candidate.item.kind}:${candidate.item.id}`;
    const previous = fused.get(key);
    fused.set(key, {
      item: candidate.item,
      score: (previous?.score ?? 0) + 1 / (RRF_K + candidate.rank),
    });
  }
  return [...fused.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

function ranked(
  items: RecallItem[],
  channel: Candidate["channel"],
): Candidate[] {
  return items.map((item, index) => ({ item, channel, rank: index + 1 }));
}

function truncate(text: string, maximum = 1_200): string {
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

async function factCandidates(
  params: RetrieveParams,
  embedding: number[] | undefined,
): Promise<Candidate[]> {
  const base = [
    eq(userFacts.userId, params.userId),
    ...(params.includeHistory
      ? []
      : [isNull(userFacts.supersededBy), isNull(userFacts.deletedAt)]),
    ...timeConditions(userFacts.createdAt, params.from, params.to),
  ];
  const selection = {
    id: userFacts.id,
    factText: userFacts.factText,
    category: userFacts.category,
    aliases: userFacts.aliases,
    confidence: userFacts.confidence,
    createdAt: userFacts.createdAt,
  };
  const toItem = (row: {
    id: string;
    factText: string;
    category: string;
    aliases: string[];
    confidence: number;
    createdAt: Date;
  }): RecallItem => ({
    kind: "facts",
    id: row.id,
    text: truncate(row.factText),
    at: row.createdAt.toISOString(),
    category: row.category,
    aliases: row.aliases,
    confidence: row.confidence,
  });
  if (!params.query) {
    const rows = await db
      .select(selection)
      .from(userFacts)
      .where(and(...base))
      .orderBy(desc(userFacts.createdAt))
      .limit(CANDIDATE_LIMIT);
    return ranked(rows.map(toItem), "date");
  }
  const query = sql`websearch_to_tsquery('english', ${params.query})`;
  const rank = sql<number>`ts_rank(${userFacts.searchText}, ${query})`;
  const keywordPromise = db
    .select(selection)
    .from(userFacts)
    .where(
      and(
        ...base,
        or(
          sql`${userFacts.searchText} @@ ${query}`,
          sql`array_to_string(${userFacts.aliases}, ' ') ILIKE ${`%${params.query}%`}`,
        ),
      ),
    )
    .orderBy(desc(rank))
    .limit(CANDIDATE_LIMIT);
  const vectorPromise = embedding
    ? db
        .select(selection)
        .from(userFacts)
        .where(and(...base, isNotNull(userFacts.embedding)))
        .orderBy(asc(cosineDistance(userFacts.embedding, embedding)))
        .limit(CANDIDATE_LIMIT)
    : Promise.resolve([]);
  const [keyword, vector] = await Promise.all([keywordPromise, vectorPromise]);
  return [
    ...ranked(vector.map(toItem), "vector"),
    ...ranked(keyword.map(toItem), "keyword"),
  ];
}

async function claimCandidates(
  params: RetrieveParams,
  embedding: number[] | undefined,
): Promise<Candidate[]> {
  const base = [
    eq(claims.userId, params.userId),
    ...(params.includeHistory ? [] : [isNull(claims.supersededBy)]),
    ...timeConditions(claims.observedAt, params.from, params.to),
  ];
  const selection = {
    id: claims.id,
    claimText: claims.claimText,
    observedAt: claims.observedAt,
    status: claims.status,
    volatility: claims.volatility,
    searchQueries: claims.searchQueries,
    sources: claims.sources,
  };
  const toItem = (row: {
    id: string;
    claimText: string;
    observedAt: Date;
    status: "current" | "outdated";
    volatility: "high" | "medium" | "static";
    searchQueries: string[];
    sources: StoredSource[];
  }): RecallItem => ({
    kind: "claims",
    id: row.id,
    text: truncate(row.claimText),
    at: row.observedAt.toISOString(),
    status: row.status,
    volatility: row.volatility,
    searchQueries: row.searchQueries,
    sources: row.sources,
  });
  if (!params.query) {
    const rows = await db
      .select(selection)
      .from(claims)
      .where(and(...base))
      .orderBy(desc(claims.observedAt))
      .limit(CANDIDATE_LIMIT);
    return ranked(rows.map(toItem), "date");
  }
  const query = sql`websearch_to_tsquery('english', ${params.query})`;
  const rank = sql<number>`ts_rank(${claims.searchText}, ${query})`;
  const keywordPromise = db
    .select(selection)
    .from(claims)
    .where(and(...base, sql`${claims.searchText} @@ ${query}`))
    .orderBy(desc(rank))
    .limit(CANDIDATE_LIMIT);
  const vectorPromise = embedding
    ? db
        .select(selection)
        .from(claims)
        .where(and(...base, isNotNull(claims.embedding)))
        .orderBy(asc(cosineDistance(claims.embedding, embedding)))
        .limit(CANDIDATE_LIMIT)
    : Promise.resolve([]);
  const [keyword, vector] = await Promise.all([keywordPromise, vectorPromise]);
  if (
    keyword.length === 0 &&
    vector.length === 0 &&
    (params.from || params.to)
  ) {
    const chronological = await db
      .select(selection)
      .from(claims)
      .where(and(...base))
      .orderBy(desc(claims.observedAt))
      .limit(CANDIDATE_LIMIT);
    return ranked(chronological.map(toItem), "date");
  }
  return [
    ...ranked(vector.map(toItem), "vector"),
    ...ranked(keyword.map(toItem), "keyword"),
  ];
}

async function messageCandidates(params: RetrieveParams): Promise<Candidate[]> {
  const base = [
    eq(messages.userId, params.userId),
    ...timeConditions(messages.createdAt, params.from, params.to),
  ];
  const selection = {
    id: messages.id,
    content: messages.content,
    createdAt: messages.createdAt,
    role: messages.role,
    conversationId: messages.conversationId,
  };
  const toItem = (row: {
    id: string;
    content: string;
    createdAt: Date;
    role: "user" | "assistant";
    conversationId: string;
  }): RecallItem => ({
    kind: "messages",
    id: row.id,
    text: truncate(row.content),
    at: row.createdAt.toISOString(),
    role: row.role,
    conversationId: row.conversationId,
  });
  if (!params.query) {
    const rows = await db
      .select(selection)
      .from(messages)
      .where(and(...base))
      .orderBy(desc(messages.createdAt))
      .limit(CANDIDATE_LIMIT);
    return ranked(rows.map(toItem), "date");
  }
  const query = sql`websearch_to_tsquery('english', ${params.query})`;
  const rank = sql<number>`ts_rank(${messages.searchText}, ${query})`;
  const rows = await db
    .select(selection)
    .from(messages)
    .where(and(...base, sql`${messages.searchText} @@ ${query}`))
    .orderBy(desc(rank))
    .limit(CANDIDATE_LIMIT);
  if (rows.length > 0 || (!params.from && !params.to)) {
    return ranked(rows.map(toItem), "keyword");
  }
  const chronological = await db
    .select(selection)
    .from(messages)
    .where(and(...base))
    .orderBy(desc(messages.createdAt))
    .limit(CANDIDATE_LIMIT);
  return ranked(chronological.map(toItem), "date");
}

async function digestCandidates(
  params: RetrieveParams,
  embedding: number[] | undefined,
): Promise<Candidate[]> {
  const base = [
    eq(dailyDigests.userId, params.userId),
    ...(params.fromDay ? [gte(dailyDigests.day, params.fromDay)] : []),
    ...(params.toDay ? [sql`${dailyDigests.day} <= ${params.toDay}`] : []),
  ];
  const selection = {
    id: dailyDigests.id,
    summary: dailyDigests.summary,
    day: dailyDigests.day,
    messageCount: dailyDigests.messageCount,
  };
  const toItem = (row: {
    id: string;
    summary: string;
    day: string;
    messageCount: number;
  }): RecallItem => ({
    kind: "digests",
    id: row.id,
    text: truncate(row.summary),
    at: row.day,
    day: row.day,
    messageCount: row.messageCount,
  });
  if (!params.query) {
    const rows = await db
      .select(selection)
      .from(dailyDigests)
      .where(and(...base))
      .orderBy(desc(dailyDigests.day))
      .limit(CANDIDATE_LIMIT);
    return ranked(rows.map(toItem), "date");
  }
  const query = sql`websearch_to_tsquery('english', ${params.query})`;
  const rank = sql<number>`ts_rank(${dailyDigests.searchText}, ${query})`;
  const keywordPromise = db
    .select(selection)
    .from(dailyDigests)
    .where(and(...base, sql`${dailyDigests.searchText} @@ ${query}`))
    .orderBy(desc(rank))
    .limit(CANDIDATE_LIMIT);
  const vectorPromise = embedding
    ? db
        .select(selection)
        .from(dailyDigests)
        .where(and(...base, isNotNull(dailyDigests.embedding)))
        .orderBy(asc(cosineDistance(dailyDigests.embedding, embedding)))
        .limit(CANDIDATE_LIMIT)
    : Promise.resolve([]);
  const [keyword, vector] = await Promise.all([keywordPromise, vectorPromise]);
  return [
    ...ranked(vector.map(toItem), "vector"),
    ...ranked(keyword.map(toItem), "keyword"),
  ];
}

export async function retrieveMemories(
  params: RetrieveParams,
): Promise<RecallItem[]> {
  const kinds = params.kinds ?? recallKindSchema.options;
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 8);
  let embedding: number[] | undefined;
  if (params.query && kinds.some((kind) => kind !== "messages")) {
    try {
      const embedQuery =
        params.embedQuery ??
        (async (query: string) => (await import("../embeddings")).embedText(query));
      embedding = await embedQuery(params.query);
    } catch {
      embedding = undefined;
    }
  }
  const candidates = await Promise.all(
    kinds.map((kind) => {
      if (kind === "facts") return factCandidates(params, embedding);
      if (kind === "claims") return claimCandidates(params, embedding);
      if (kind === "messages") return messageCandidates(params);
      return digestCandidates(params, embedding);
    }),
  );
  return fuse(candidates.flat(), limit);
}
