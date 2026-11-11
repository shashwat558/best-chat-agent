import { z } from "zod";
import { config } from "./config";
import { EMBEDDING_DIMENSIONS } from "./db/schema";

const embeddingInputSchema = z.string().trim().min(1).max(20_000);
const embeddingInputsSchema = z.array(embeddingInputSchema).min(1).max(100);
const embeddingSchema = z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS);
const embeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: embeddingSchema,
      index: z.number().int().nonnegative(),
    }),
  ),
});

export class EmbeddingsUnavailableError extends Error {
  constructor() {
    super("Embeddings are not configured");
    this.name = "EmbeddingsUnavailableError";
  }
}

function getEmbeddingConfig() {
  if (
    !config.EMBEDDING_API_KEY ||
    !config.EMBEDDING_BASE_URL ||
    !config.EMBEDDING_MODEL
  ) {
    throw new EmbeddingsUnavailableError();
  }

  return {
    apiKey: config.EMBEDDING_API_KEY,
    baseUrl: config.EMBEDDING_BASE_URL,
    model: config.EMBEDDING_MODEL,
  };
}

async function requestEmbeddings(
  inputs: string[],
  abortSignal?: AbortSignal,
): Promise<number[][]> {
  const embeddingConfig = getEmbeddingConfig();
  const response = await fetch(
    `${embeddingConfig.baseUrl.replace(/\/$/, "")}/embeddings`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${embeddingConfig.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: inputs,
        model: embeddingConfig.model,
        dimensions: EMBEDDING_DIMENSIONS,
        encoding_format: "float",
      }),
      signal: abortSignal,
    },
  );

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const parsed = embeddingResponseSchema.parse(await response.json());
  const ordered = parsed.data.toSorted((left, right) => left.index - right.index);

  return z.array(embeddingSchema).length(inputs.length).parse(
    ordered.map((item) => item.embedding),
  );
}

export async function embedText(
  input: string,
  abortSignal?: AbortSignal,
): Promise<number[]> {
  const value = embeddingInputSchema.parse(input);
  const [embedding] = await requestEmbeddings([value], abortSignal);

  return embeddingSchema.parse(embedding);
}

export async function embedTexts(
  inputs: string[],
  abortSignal?: AbortSignal,
): Promise<number[][]> {
  const values = embeddingInputsSchema.parse(inputs);
  return requestEmbeddings(values, abortSignal);
}
