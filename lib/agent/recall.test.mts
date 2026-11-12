import assert from "node:assert/strict";
import test from "node:test";
import { runRecall } from "./tools/recall.ts";
import { createTurnState } from "./turn-state.ts";

test("recall scopes identity server-side and converts local dates", async () => {
  const turnState = createTurnState();
  const result = await runRecall(
    {
      userId: "server-user",
      timezone: "Asia/Kolkata",
      turnState,
      retrieve: async (params) => {
        assert.equal(params.userId, "server-user");
        assert.equal(params.from?.toISOString(), "2026-11-02T18:30:00.000Z");
        assert.equal(params.to?.toISOString(), "2026-11-03T18:30:00.000Z");
        return [];
      },
    },
    {
      query: "",
      from: "2026-11-03",
      to: "2026-11-03",
      kinds: ["messages"],
    },
  );
  assert.deepEqual(result, { items: [] });
  assert.equal(turnState.recallCalls.length, 1);
});

test("recall exposes memory failure instead of throwing", async () => {
  const turnState = createTurnState();
  const result = await runRecall(
    {
      userId: "server-user",
      timezone: "UTC",
      turnState,
      retrieve: async () => {
        throw new Error("database offline");
      },
    },
    { query: "earlier preference" },
  );
  assert.deepEqual(result, { error: "memory_unavailable" });
  assert.equal(turnState.recallCalls[0]?.error, "memory_unavailable");
});
