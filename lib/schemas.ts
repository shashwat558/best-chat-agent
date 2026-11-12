import { z } from "zod";
import { timezoneSchema } from "./time";

export const chatRequestSchema = z.object({
  conversationId: z.uuid(),
  message: z.string().trim().min(1).max(20_000),
  timezone: timezoneSchema,
});

export const chatHistoryQuerySchema = z.object({
  conversationId: z.uuid(),
});

export const textMessagePartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const chatHistoryResponseSchema = z.object({
  conversationId: z.uuid(),
  messages: z.array(
    z.object({
      id: z.uuid(),
      role: z.enum(["user", "assistant"]),
      parts: z.array(z.object({ type: z.string() }).loose()),
    }),
  ),
});

export const storedMessagePartsSchema = z.array(
  z.record(z.string(), z.unknown()),
);

export const memoryQuerySchema = z.object({
  query: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatHistoryResponse = z.infer<typeof chatHistoryResponseSchema>;
export type MemoryQuery = z.infer<typeof memoryQuerySchema>;
