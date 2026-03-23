import { config } from "dotenv";
import { z } from "zod";
import { ConfigError } from "../errors/index.js";

config();

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  PINECONE_API_KEY: z.string().min(1, "PINECONE_API_KEY is required"),
  PINECONE_INDEX: z.string().default("career-assistant"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o"),
  CHUNK_SIZE: z.coerce.number().int().positive().default(1000),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(200),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    const missingVars = result.error.issues
      .map((i) => i.path.join("."))
      .filter(Boolean);

    throw new ConfigError(
      `Invalid environment configuration:\n${formatted}\n\nSee .env.example for required variables.`,
      missingVars,
    );
  }

  return result.data;
}

/** Validated environment configuration — fails fast on startup if misconfigured. */
export const env = loadEnv();
