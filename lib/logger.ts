import { createHash } from "node:crypto";

type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type LogLevel = "debug" | "info" | "warn" | "error";

const sensitiveKey = /api.?key|authorization|cookie|password|secret|token/i;

function redactString(value: string): string {
  return value
    .replace(/\b(?:sk-|gsk_|tvly-)[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/gi, "$1[REDACTED]@");
}

function toJsonValue(value: unknown, key = ""): JsonValue {
  if (sensitiveKey.test(key)) {
    return "[REDACTED]";
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      message: redactString(value.message),
      name: value.name,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        toJsonValue(entryValue, entryKey),
      ]),
    );
  }
  return String(value);
}

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function logStructured(
  level: LogLevel,
  event: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  const sanitizedFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, toJsonValue(value, key)]),
  );
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizedFields,
  });

  const destination = level === "error" ? process.stderr : process.stdout;
  destination.write(`${line}\n`);
}
