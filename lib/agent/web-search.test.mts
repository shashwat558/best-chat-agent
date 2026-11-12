import assert from "node:assert/strict";
import test from "node:test";
import { createExaSearchProvider, type SearchProvider } from "./search-provider.ts";
import { citedSourceIds, createTurnState } from "./turn-state.ts";
import { runWebSearch } from "./tools/web-search.ts";

test("Exa provider sends the documented request and validates results", async () => {
  let request: Request | undefined;
  const provider = createExaSearchProvider("test-key", async (input, init) => {
    request = new Request(input, init);
    return Response.json({
      results: [
        {
          url: "https://example.com/current",
          title: "Current result",
          highlights: ["Useful excerpt"],
          publishedDate: "2026-11-12T00:00:00.000Z",
        },
      ],
    });
  });

  const results = await provider.search({ query: "current example", limit: 5 });
  assert.equal(request?.url, "https://api.exa.ai/search");
  assert.equal(request?.headers.get("x-api-key"), "test-key");
  assert.deepEqual(await request?.json(), {
    query: "current example",
    type: "auto",
    numResults: 5,
    contents: { highlights: { maxCharacters: 1_200 } },
  });
  assert.equal(results[0]?.content, "Useful excerpt");
});

test("web search caps results and assigns turn-wide source ids", async () => {
  const provider: SearchProvider = {
    async search() {
      return Array.from({ length: 7 }, (_, index) => ({
        url: `https://example.com/${index}`,
        title: `Result ${index}`,
        content: "x".repeat(1_500),
      }));
    },
  };
  const turnState = createTurnState();

  const first = await runWebSearch(provider, turnState, "first query");
  const second = await runWebSearch(provider, turnState, "second query");
  assert.ok(first.results);
  assert.ok(second.results);
  assert.equal(first.results.length, 5);
  assert.equal(first.results[0]?.id, "s1");
  assert.equal(first.results[0]?.content.length, 1_200);
  assert.equal(second.results[0]?.id, "s6");
});

test("web search retries once and degrades visibly", async () => {
  let calls = 0;
  const provider: SearchProvider = {
    async search() {
      calls += 1;
      throw new Error("offline");
    },
  };
  const turnState = createTurnState();

  const result = await runWebSearch(provider, turnState, "failed query");
  assert.deepEqual(result, {
    query: "failed query",
    error: "search_unavailable",
  });
  assert.equal(calls, 2);
  assert.equal(turnState.searchCalls[0]?.attempts, 2);
});

test("citation integrity recognizes plain and decorative model brackets", () => {
  assert.deepEqual(citedSourceIds("One [s1], two 【s2】, again [S1]."), [
    "s1",
    "s2",
    "s1",
  ]);
});
