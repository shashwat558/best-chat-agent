import { DateTime } from "luxon";
import { z } from "zod";

export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD")
  .refine(
    (value) => DateTime.fromFormat(value, "yyyy-MM-dd").isValid,
    "must be a valid calendar date",
  );

export const timezoneSchema = z.string().refine(
  (value) => DateTime.local().setZone(value).isValid,
  "must be a valid IANA timezone",
);

export type UtcRange = Readonly<{
  from: Date;
  to: Date;
}>;

export type OptionalUtcRange = Readonly<{
  from?: Date;
  to?: Date;
}>;

function localStartOfDay(day: string, timezone: string): DateTime {
  const validDay = calendarDaySchema.parse(day);
  const validTimezone = timezoneSchema.parse(timezone);
  const result = DateTime.fromFormat(validDay, "yyyy-MM-dd", {
    zone: validTimezone,
    setZone: true,
  }).startOf("day");

  if (!result.isValid) {
    throw new Error(result.invalidExplanation ?? "Invalid local calendar day");
  }

  return result;
}

export function localDayToUtcRange(day: string, timezone: string): UtcRange {
  const from = localStartOfDay(day, timezone);
  return {
    from: from.toUTC().toJSDate(),
    to: from.plus({ days: 1 }).toUTC().toJSDate(),
  };
}

export function localDateRangeToUtc(
  fromDay: string,
  toDay: string,
  timezone: string,
): UtcRange {
  const from = localStartOfDay(fromDay, timezone);
  const to = localStartOfDay(toDay, timezone).plus({ days: 1 });
  if (to <= from) {
    throw new Error("The end day must be on or after the start day");
  }

  return {
    from: from.toUTC().toJSDate(),
    to: to.toUTC().toJSDate(),
  };
}

export function localDateBoundsToUtc(
  fromDay: string | undefined,
  toDay: string | undefined,
  timezone: string,
): OptionalUtcRange {
  const from = fromDay ? localStartOfDay(fromDay, timezone) : undefined;
  const to = toDay
    ? localStartOfDay(toDay, timezone).plus({ days: 1 })
    : undefined;
  if (from && to && to <= from) {
    throw new Error("The end day must be on or after the start day");
  }
  return {
    ...(from ? { from: from.toUTC().toJSDate() } : {}),
    ...(to ? { to: to.toUTC().toJSDate() } : {}),
  };
}

export function formatCurrentTime(now: Date, timezone: string): string {
  const validTimezone = timezoneSchema.parse(timezone);
  const result = DateTime.fromJSDate(now, { zone: validTimezone });
  if (!result.isValid) {
    throw new Error(result.invalidExplanation ?? "Invalid timestamp");
  }

  return result.toFormat("yyyy-MM-dd HH:mm:ss ZZZZ");
}

export function localCalendarDay(now: Date, timezone: string): string {
  const validTimezone = timezoneSchema.parse(timezone);
  const day = DateTime.fromJSDate(now, { zone: validTimezone }).toISODate();
  if (!day) {
    throw new Error("Unable to determine the local calendar day");
  }

  return day;
}
