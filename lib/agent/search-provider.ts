import { z } from "zod";

const exaResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.url(),
      title: z.string().nullish(),
      text: z.string().nullish(),
      highlights: z.array(z.string()).nullish(),
      publishedDate: z.string().nullish(),
    }),
  ),
});

export type SearchProviderResult = Readonly<{
  url: string;
  title: string;
  content: string;
  publishedDate?: string;
}>;

export interface SearchProvider {
  search(
    input: Readonly<{ query: string; limit: number }>,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<SearchProviderResult[]>;
}

export function createExaSearchProvider(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): SearchProvider {
  return {
    async search(input, options) {
      const response = await fetcher("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query: input.query,
          type: "auto",
          numResults: input.limit,
          contents: { highlights: { maxCharacters: 1_200 } },
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`Exa search failed with status ${response.status}`);
      }

      const payload: unknown = await response.json();
      const parsed = exaResponseSchema.parse(payload);
      return parsed.results.map((result) => ({
        url: result.url,
        title: result.title?.trim() || new URL(result.url).hostname,
        content: (result.highlights?.join("\n") || result.text || "").trim(),
        ...(result.publishedDate
          ? { publishedDate: result.publishedDate }
          : {}),
      }));
    },
  };
}
