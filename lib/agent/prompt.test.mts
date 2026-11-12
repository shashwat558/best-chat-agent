import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemPrompt } from "./prompt.ts";

test("recheck instructions separate historical metadata from fresh citations", () => {
  const prompt = buildSystemPrompt({
    now: "November 12, 2026 at 12:00 PM GMT+5:30",
    timezone: "Asia/Kolkata",
  });

  assert.match(prompt, /kinds set to \["claims"\]/);
  assert.match(prompt, /Then,[\s\S]*Now,[\s\S]*Verdict/);
  assert.match(prompt, /Never put an \[sN\] citation in the Then section/);
  assert.match(prompt, /Now section must cite the fresh webSearch source ids/);
});

test("prior user messages are treated as proof of an earlier discussion", () => {
  const prompt = buildSystemPrompt({
    now: "November 12, 2026 at 12:00 PM GMT+5:30",
    timezone: "Asia/Kolkata",
  });

  assert.match(prompt, /earlier matching item with role "user" proves they did/);
  assert.match(prompt, /never answer "no" when an earlier matching user message is present/);
  assert.match(prompt, /never use that current message as proof/);
});
