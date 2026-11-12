import { createGoogle } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import { z } from "zod";
import { config } from "./config";
import { EMBEDDING_DIMENSIONS } from "./db/schema";

const embeddingInputSchema = z.string().trim().min(1).max(20_000);
const embeddingInputsSchema = z.array(embeddingInputSchema).min(1).max(100);
const embeddingSchema = z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS);
const google = createGoogle({ apiKey: config.GEMINI_API_KEY });
const embeddingModel = google.embedding(config.EMBEDDING_MODEL);

export async function embedText(
  input: string,
  abortSignal?: AbortSignal,
): Promise<number[]> {
  const value = embeddingInputSchema.parse(input);
  const result = await embed({
    model: embeddingModel,
    value,
    dimensions: EMBEDDING_DIMENSIONS,
    abortSignal,
  });
  return embeddingSchema.parse(result.embedding);
}

export async function embedTexts(
  inputs: string[],
  abortSignal?: AbortSignal,
): Promise<number[][]> {
  const values = embeddingInputsSchema.parse(inputs);
  const result = await embedMany({
    model: embeddingModel,
    values,
    dimensions: EMBEDDING_DIMENSIONS,
    abortSignal,
  });
  return z
    .array(embeddingSchema)
    .length(values.length)
    .parse(result.embeddings);
}
