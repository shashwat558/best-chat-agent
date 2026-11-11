import { sql } from "drizzle-orm";
import {
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 1536;

export type StoredSource = {
  id: string;
  url: string;
  title: string;
  content?: string;
  publishedDate?: string;
  retrievedAt: string;
};

export type StoredMessagePart = Record<string, unknown>;

const searchVector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const messageRole = pgEnum("message_role", ["user", "assistant"]);
export const claimVolatility = pgEnum("claim_volatility", [
  "high",
  "medium",
  "static",
]);
export const claimStatus = pgEnum("claim_status", [
  "current",
  "outdated",
]);
export const claimCheckResult = pgEnum("claim_check_result", [
  "still_valid",
  "changed",
  "unclear",
]);

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  profileText: text("profile_text").notNull().default(""),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    parts: jsonb("parts").$type<StoredMessagePart[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    searchText: searchVector("search_text").generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, coalesce(content, ''))`,
    ),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("messages_user_created_idx").on(table.userId, table.createdAt),
    index("messages_search_text_idx").using("gin", table.searchText),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    assistantMessageId: uuid("assistant_message_id").references(
      () => messages.id,
      { onDelete: "set null" },
    ),
    claimText: text("claim_text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    volatility: claimVolatility("volatility").notNull(),
    searchQueries: jsonb("search_queries").$type<string[]>().notNull().default([]),
    sources: jsonb("sources").$type<StoredSource[]>().notNull().default([]),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    status: claimStatus("status").notNull().default("current"),
    supersededBy: uuid("superseded_by").references(
      (): AnyPgColumn => claims.id,
      { onDelete: "set null" },
    ),
    searchText: searchVector("search_text").generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, coalesce(claim_text, ''))`,
    ),
  },
  (table) => [
    index("claims_user_observed_idx").on(table.userId, table.observedAt),
    index("claims_user_status_idx").on(table.userId, table.status),
    index("claims_search_text_idx").using("gin", table.searchText),
    index("claims_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const claimChecks = pgTable(
  "claim_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    result: claimCheckResult("result").notNull(),
    summary: text("summary").notNull(),
    queries: jsonb("queries").$type<string[]>().notNull().default([]),
    sources: jsonb("sources").$type<StoredSource[]>().notNull().default([]),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("claim_checks_user_checked_idx").on(table.userId, table.checkedAt),
    index("claim_checks_claim_checked_idx").on(table.claimId, table.checkedAt),
  ],
);

export const userFacts = pgTable(
  "user_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    factText: text("fact_text").notNull(),
    category: text("category").notNull(),
    aliases: text("aliases").array().notNull().default([]),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    confidence: real("confidence").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    supersededBy: uuid("superseded_by").references(
      (): AnyPgColumn => userFacts.id,
      { onDelete: "set null" },
    ),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    searchText: searchVector("search_text").generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, coalesce(fact_text, ''))`,
    ),
  },
  (table) => [
    index("user_facts_user_created_idx").on(table.userId, table.createdAt),
    index("user_facts_search_text_idx").using("gin", table.searchText),
    index("user_facts_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const dailyDigests = pgTable(
  "daily_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    summary: text("summary").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    searchText: searchVector("search_text").generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, coalesce(summary, ''))`,
    ),
  },
  (table) => [
    uniqueIndex("daily_digests_user_day_uidx").on(table.userId, table.day),
    index("daily_digests_search_text_idx").using("gin", table.searchText),
    index("daily_digests_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type ClaimCheck = typeof claimChecks.$inferSelect;
export type UserFact = typeof userFacts.$inferSelect;
export type DailyDigest = typeof dailyDigests.$inferSelect;
