import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
});

export const memoryQuerySchema = z.object({
  query: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type MemoryQuery = z.infer<typeof memoryQuerySchema>;
