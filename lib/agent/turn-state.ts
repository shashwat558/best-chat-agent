import type { SearchProviderResult } from "./search-provider";
import type { RecallItem } from "../memory/types";

export type TurnSource = SearchProviderResult &
  Readonly<{
    id: string;
    retrievedAt: string;
  }>;

export type SearchCallRecord = Readonly<{
  query: string;
  durationMs: number;
  attempts: number;
  results: TurnSource[];
  error?: "search_unavailable";
}>;

export type TurnState = {
  nextSourceNumber: number;
  searchCalls: SearchCallRecord[];
  recallCalls: Array<
    Readonly<{
      query: string;
      durationMs: number;
      results: RecallItem[];
      error?: "memory_unavailable";
    }>
  >;
};

export function createTurnState(): TurnState {
  return { nextSourceNumber: 1, searchCalls: [], recallCalls: [] };
}

export function sourceIds(turnState: TurnState): Set<string> {
  return new Set(
    turnState.searchCalls.flatMap((call) =>
      call.results.map((result) => result.id),
    ),
  );
}

export function citedSourceIds(text: string): string[] {
  return [...text.matchAll(/\[(s\d+)\]/gi)].map((match) =>
    match[1].toLowerCase(),
  );
}
