import type { SearchProviderResult } from "./search-provider";

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
};

export function createTurnState(): TurnState {
  return { nextSourceNumber: 1, searchCalls: [] };
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
