import { z } from "zod";
import type { StoredSource } from "../db/schema";

export const recallKindSchema = z.enum([
  "facts",
  "claims",
  "messages",
  "digests",
]);

export type RecallKind = z.infer<typeof recallKindSchema>;

export type RecallItem = Readonly<{
  kind: RecallKind;
  id: string;
  text: string;
  at: string;
  role?: "user" | "assistant";
  conversationId?: string;
  category?: string;
  aliases?: string[];
  confidence?: number;
  status?: "current" | "outdated";
  volatility?: "high" | "medium" | "static";
  searchQueries?: string[];
  sources?: StoredSource[];
  day?: string;
  messageCount?: number;
}>;

export type RetrieveParams = Readonly<{
  userId: string;
  query: string;
  from?: Date;
  to?: Date;
  fromDay?: string;
  toDay?: string;
  kinds?: RecallKind[];
  includeHistory?: boolean;
  limit?: number;
  embedQuery?: (query: string) => Promise<number[]>;
}>;
