import assert from "node:assert/strict";
import test from "node:test";
import {
  localCalendarDay,
  localDateBoundsToUtc,
  localDateRangeToUtc,
  localDayToUtcRange,
} from "./time.ts";

test("converts a non-UTC local day across a UTC date boundary", () => {
  const range = localDayToUtcRange("2026-11-03", "Asia/Kolkata");

  assert.equal(range.from.toISOString(), "2026-11-02T18:30:00.000Z");
  assert.equal(range.to.toISOString(), "2026-11-03T18:30:00.000Z");
});

test("uses calendar arithmetic across a daylight-saving boundary", () => {
  const range = localDayToUtcRange("2026-03-08", "America/New_York");

  assert.equal(range.from.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(range.to.getTime() - range.from.getTime(), 23 * 60 * 60 * 1000);
});

test("treats the end date as an inclusive local calendar day", () => {
  const range = localDateRangeToUtc(
    "2026-11-03",
    "2026-11-04",
    "Asia/Kolkata",
  );

  assert.equal(range.from.toISOString(), "2026-11-02T18:30:00.000Z");
  assert.equal(range.to.toISOString(), "2026-11-04T18:30:00.000Z");
});

test("renders a date using the supplied timezone", () => {
  assert.equal(
    localCalendarDay(new Date("2026-11-02T20:00:00.000Z"), "Asia/Kolkata"),
    "2026-11-03",
  );
});

test("converts one-sided local date bounds", () => {
  assert.deepEqual(localDateBoundsToUtc("2026-11-03", undefined, "Asia/Kolkata"), {
    from: new Date("2026-11-02T18:30:00.000Z"),
  });
  assert.deepEqual(localDateBoundsToUtc(undefined, "2026-11-03", "Asia/Kolkata"), {
    to: new Date("2026-11-03T18:30:00.000Z"),
  });
});
