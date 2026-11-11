CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."claim_check_result" AS ENUM('still_valid', 'changed', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('current', 'outdated');--> statement-breakpoint
CREATE TYPE "public"."claim_volatility" AS ENUM('high', 'medium', 'static');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "claim_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"claim_id" uuid NOT NULL,
	"result" "claim_check_result" NOT NULL,
	"summary" text NOT NULL,
	"queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"assistant_message_id" uuid,
	"claim_text" text NOT NULL,
	"embedding" vector(1536),
	"volatility" "claim_volatility" NOT NULL,
	"search_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"status" "claim_status" DEFAULT 'current' NOT NULL,
	"superseded_by" uuid,
	"search_text" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(claim_text, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"summary" text NOT NULL,
	"embedding" vector(1536),
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_text" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(summary, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_text" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(content, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "user_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"fact_text" text NOT NULL,
	"category" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"embedding" vector(1536),
	"confidence" real NOT NULL,
	"source_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" uuid,
	"deleted_at" timestamp with time zone,
	"search_text" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(fact_text, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"profile_text" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_checks" ADD CONSTRAINT "claim_checks_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_superseded_by_claims_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facts" ADD CONSTRAINT "user_facts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facts" ADD CONSTRAINT "user_facts_superseded_by_user_facts_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."user_facts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_checks_user_checked_idx" ON "claim_checks" USING btree ("user_id","checked_at");--> statement-breakpoint
CREATE INDEX "claim_checks_claim_checked_idx" ON "claim_checks" USING btree ("claim_id","checked_at");--> statement-breakpoint
CREATE INDEX "claims_user_observed_idx" ON "claims" USING btree ("user_id","observed_at");--> statement-breakpoint
CREATE INDEX "claims_user_status_idx" ON "claims" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "claims_search_text_idx" ON "claims" USING gin ("search_text");--> statement-breakpoint
CREATE INDEX "claims_embedding_hnsw_idx" ON "claims" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_digests_user_day_uidx" ON "daily_digests" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "daily_digests_search_text_idx" ON "daily_digests" USING gin ("search_text");--> statement-breakpoint
CREATE INDEX "daily_digests_embedding_hnsw_idx" ON "daily_digests" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_user_created_idx" ON "messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_search_text_idx" ON "messages" USING gin ("search_text");--> statement-breakpoint
CREATE INDEX "user_facts_user_created_idx" ON "user_facts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_facts_search_text_idx" ON "user_facts" USING gin ("search_text");--> statement-breakpoint
CREATE INDEX "user_facts_embedding_hnsw_idx" ON "user_facts" USING hnsw ("embedding" vector_cosine_ops);
