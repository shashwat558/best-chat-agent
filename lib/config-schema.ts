import { z } from "zod";

const databaseUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  },
  "must be a PostgreSQL connection string",
);

const apiKeySchema = z
  .string()
  .trim()
  .min(1, "is required")
  .refine(
    (value) => !value.includes("...") && !/replace[-_ ]?me/i.test(value),
    "must not be a placeholder",
  );

const environmentSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    GROQ_API_KEY: apiKeySchema,
    EXA_API_KEY: apiKeySchema,
    GEMINI_API_KEY: apiKeySchema,
    CHAT_MODEL: z.string().trim().min(1, "is required"),
    FAST_MODEL: z.string().trim().min(1, "is required"),
    EMBEDDING_MODEL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().min(1, "is required").default("gemini-embedding-2"),
    ),
    COOKIE_SECRET: z.string().min(32, "must contain at least 32 characters"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  });

export type AppConfig = Readonly<z.infer<typeof environmentSchema>>;

export function parseConfig(
  environment: Readonly<Record<string, string | undefined>>,
): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return Object.freeze(result.data);
}
