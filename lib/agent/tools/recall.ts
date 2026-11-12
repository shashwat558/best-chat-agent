import { tool } from "ai";
import { z } from "zod";
import {
  recallKindSchema,
  type RetrieveParams,
} from "../../memory/types.ts";
import { calendarDaySchema, localDateBoundsToUtc } from "../../time.ts";
import type { TurnState } from "../turn-state";

export const recallInputSchema = z
  .object({
    query: z.string().trim().max(500),
    from: calendarDaySchema.optional(),
    to: calendarDaySchema.optional(),
    kinds: z.array(recallKindSchema).min(1).max(4).optional(),
    includeHistory: z.boolean().optional(),
  })
  .refine(
    ({ from, to }) => !from || !to || from <= to,
    "to must be on or after from",
  );

type RecallArguments = z.infer<typeof recallInputSchema>;
type RecallDependencies = Readonly<{
  userId: string;
  timezone: string;
  turnState: TurnState;
  retrieve?: (params: RetrieveParams) => Promise<import("../../memory/types.ts").RecallItem[]>;
}>;

export async function runRecall(
  input: RecallDependencies,
  { query, from, to, kinds, includeHistory }: RecallArguments,
) {
  const startedAt = performance.now();
  try {
    const range = localDateBoundsToUtc(from, to, input.timezone);
    const retrieve =
      input.retrieve ??
      (async (params: RetrieveParams) =>
        (await import("../../memory/retrieve.ts")).retrieveMemories(params));
    const items = await retrieve({
      userId: input.userId,
      query,
      ...range,
      fromDay: from,
      toDay: to,
      kinds,
      includeHistory,
      limit: 8,
    });
    input.turnState.recallCalls.push({
      query,
      durationMs: Math.round(performance.now() - startedAt),
      results: items,
    });
    return { items };
  } catch {
    input.turnState.recallCalls.push({
      query,
      durationMs: Math.round(performance.now() - startedAt),
      results: [],
      error: "memory_unavailable",
    });
    return { error: "memory_unavailable" as const };
  }
}

export function createRecallTool(input: RecallDependencies) {
  return tool({
    description:
      "Recall the user's facts, prior web claims, raw messages, or daily digests. Use kinds: [claims] when re-checking whether an earlier web answer is still valid; a message is not a substitute for the claim ledger. Use for earlier conversations, specific dates, and personal context not already in the prompt. Dates are local YYYY-MM-DD calendar days. For a date-only lookup, pass an empty query so results are chronological.",
    inputSchema: recallInputSchema,
    execute: (arguments_) => runRecall(input, arguments_),
  });
}
