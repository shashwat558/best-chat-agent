import assert from "node:assert/strict";
import test from "node:test";
import {
  balanceStreamingFences,
  citationLinksToMarkdown,
  prepareMarkdownText,
} from "./markdown.ts";

test("citation markers become fragment links", () => {
  assert.equal(
    citationLinksToMarkdown("Rust is fast [s1], per benchmark data 【s12】."),
    "Rust is fast [1](#src-s1), per benchmark data [12](#src-s12).",
  );
  assert.equal(
    citationLinksToMarkdown("[S3] keeps its case-insensitive id"),
    "[3](#src-s3) keeps its case-insensitive id",
  );
});

test("text without citations is unchanged", () => {
  const text = "An [array](https://example.com) and a normal [word].";
  assert.equal(citationLinksToMarkdown(text), text);
});

test("balanced code fences are untouched", () => {
  const text = "before\n```python\nprint(1)\n```\nafter";
  assert.equal(balanceStreamingFences(text), text);
});

test("an unclosed fence gets a closing fence", () => {
  assert.equal(
    balanceStreamingFences("Look:\n```python\nprint(1)\n"),
    "Look:\n```python\nprint(1)\n```\n",
  );
  assert.equal(
    balanceStreamingFences("Look:\n```python\nprint(1)"),
    "Look:\n```python\nprint(1)\n```",
  );
});

test("nested and longer fences open and close correctly", () => {
  const text = "````md\n```js\nx()\n```\n````\ndone";
  assert.equal(balanceStreamingFences(text), text);
  assert.equal(
    balanceStreamingFences("````md\n```js\nx()\n```\n"),
    "````md\n```js\nx()\n```\n````\n",
  );
  assert.equal(
    balanceStreamingFences("```js\nx()\n````\n"),
    "```js\nx()\n````\n````",
  );
});

test("tilde fences are supported", () => {
  assert.equal(
    balanceStreamingFences("~~~sh\necho hi\n"),
    "~~~sh\necho hi\n~~~\n",
  );
});

test("prepare combines both transforms", () => {
  assert.equal(
    prepareMarkdownText("```ts\nconst x: string = \"a\"; // [s2]\n"),
    "```ts\nconst x: string = \"a\"; // [s2]\n```\n",
  );
  assert.equal(
    prepareMarkdownText("It works [s1].\n```js\nx()\n"),
    "It works [1](#src-s1).\n```js\nx()\n```",
  );
});

test("citations inside fenced code stay literal", () => {
  assert.equal(
    citationLinksToMarkdown("```sh\ngrep '\\[s1\\]' log.txt\n```"),
    "```sh\ngrep '\\[s1\\]' log.txt\n```",
  );
});
