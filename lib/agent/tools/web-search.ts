import { tool } from "ai";
import { z } from "zod";
import type { SearchProvider } from "../search-provider";
import type { TurnSource, TurnState } from "../turn-state";

const inputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .describe("A standalone web search query that names the subject"),
});

const MAX_RESULTS = 5;
const CONTENT_LIMIT = 1_200;
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 250;

function waitForRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, RETRY_DELAY_MS);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function searchWithTimeout(
  searchProvider: SearchProvider,
  query: string,
  signal?: AbortSignal,
) {
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  return searchProvider.search(
    { query, limit: MAX_RESULTS },
    { signal: combinedSignal },
  );
}

export async function runWebSearch(
  searchProvider: SearchProvider,
  turnState: TurnState,
  query: string,
  abortSignal?: AbortSignal,
) {
  const startedAt = performance.now();
  let attempts = 0;

  try {
    let providerResults: Awaited<ReturnType<SearchProvider["search"]>> = [];
    for (attempts = 1; attempts <= 2; attempts += 1) {
      try {
        providerResults = await searchWithTimeout(
          searchProvider,
          query,
          abortSignal,
        );
        break;
      } catch (error) {
        if (attempts === 2 || abortSignal?.aborted) {
          throw error;
        }
        await waitForRetry(abortSignal);
      }
    }

    const retrievedAt = new Date().toISOString();
    const results: TurnSource[] = providerResults
      .slice(0, MAX_RESULTS)
      .map((result) => ({
        ...result,
        content: result.content.slice(0, CONTENT_LIMIT),
        id: `s${turnState.nextSourceNumber++}`,
        retrievedAt,
      }));
    turnState.searchCalls.push({
      query,
      durationMs: Math.round(performance.now() - startedAt),
      attempts,
      results,
    });
    return { query, results };
  } catch {
    turnState.searchCalls.push({
      query,
      durationMs: Math.round(performance.now() - startedAt),
      attempts,
      results: [],
      error: "search_unavailable",
    });
    return { query, error: "search_unavailable" as const };
  }
}

export function createWebSearchTool(
  searchProvider: SearchProvider,
  turnState: TurnState,
) {
  return tool({
    description:
      "Search the current web. Use for recent, changing, uncertain, or explicitly current information. The query must stand alone and name its subject.",
    inputSchema,
    execute: ({ query }, { abortSignal }) =>
      runWebSearch(searchProvider, turnState, query, abortSignal),
  });
}
