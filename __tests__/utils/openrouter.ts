/**
 * OpenRouter testing utilities for structured LLM output
 *
 * Uses Vercel AI SDK's generateObject for type-safe structured generation.
 *
 * Environment Variables:
 * - OPENROUTER_API_KEY (required): Your OpenRouter API key
 * - OPENROUTER_BASE_URL (optional): OpenRouter base URL
 * - OPENROUTER_SMALL_MODEL (optional): Small/fast model (default: openai/gpt-4o-mini)
 * - OPENROUTER_LARGE_MODEL (optional): Large/powerful model (default: openai/gpt-4o-2024-08-06)
 *
 * @see @structured-output-testing.mdc for usage patterns and configuration
 * @see https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

/**
 * OpenRouter configuration for tests
 */
export interface OpenRouterConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

/**
 * Default OpenRouter configuration from environment
 */
const defaultConfig: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL,
  defaultModel: process.env.OPENROUTER_SMALL_MODEL || "openai/gpt-4o-mini",
};

/**
 * Validate OpenRouter configuration
 */
export function validateOpenRouterConfig(
  config: OpenRouterConfig = defaultConfig
): void {
  if (!config.apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required for LLM tests. " +
        "Set it in .env.test or pass it explicitly."
    );
  }
}

/**
 * Generate structured output using OpenRouter and Vercel AI SDK
 *
 * @template T - Zod schema type
 * @param schema - Zod schema for structured output
 * @param prompt - Prompt string for the LLM
 * @param options - Optional configuration
 * @returns Promise resolving to structured output matching schema
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   suggestions: z.array(z.object({
 *     label: z.string(),
 *     text: z.string(),
 *   })),
 * });
 *
 * // Returns the structured object directly
 * const result = await generateStructured(schema, myPrompt);
 * console.log(result.suggestions); // Type-safe access to suggestions
 * ```
 */
export async function generateStructured<T extends z.ZodType>(
  schema: T,
  prompt: string,
  options: {
    modelName?: string;
    temperature?: number;
    config?: OpenRouterConfig;
  } = {}
): Promise<z.infer<T>> {
  const config = { ...defaultConfig, ...options.config };
  const modelName =
    options.modelName || config.defaultModel || "anthropic/claude-3.5-sonnet";
  const temperature = options.temperature ?? 0; // Default to deterministic

  // Validate config
  validateOpenRouterConfig(config);

  // Create OpenRouter provider
  const openrouter = createOpenRouter({
    apiKey: config.apiKey as string,
    baseURL: config.baseURL,
  });

  const modelInstance = openrouter.chat(modelName);

  // Generate structured output using AI SDK's generateObject
  const result = await generateObject({
    model: modelInstance,
    schema,
    prompt,
    temperature,
  });

  return result.object as z.infer<T>;
}

/**
 * Generate multiple structured outputs concurrently
 * Useful for testing determinism or batch generation
 *
 * @template T - Zod schema type
 * @param schema - Zod schema for structured output
 * @param prompts - Array of prompt strings
 * @param options - Optional configuration
 * @returns Promise resolving to array of structured outputs
 *
 * @example
 * ```typescript
 * const results = await generateStructuredBatch(schema, [prompt1, prompt2]);
 * expect(results).toHaveLength(2);
 * ```
 */
export async function generateStructuredBatch<T extends z.ZodType>(
  schema: T,
  prompts: string[],
  options: {
    modelName?: string;
    temperature?: number;
    config?: OpenRouterConfig;
  } = {}
): Promise<Array<z.infer<T>>> {
  return Promise.all(
    prompts.map((prompt) => generateStructured(schema, prompt, options))
  );
}

/**
 * Test determinism by generating the same prompt twice
 * With temperature 0, results should be identical
 *
 * @template T - Zod schema type
 * @param schema - Zod schema for structured output
 * @param prompt - Prompt string
 * @param options - Optional configuration
 * @returns Promise resolving to both results for comparison
 *
 * @example
 * ```typescript
 * const [result1, result2] = await testDeterminism(schema, prompt);
 * expect(result1).toEqual(result2);
 * ```
 */
export async function testDeterminism<T extends z.ZodType>(
  schema: T,
  prompt: string,
  options: {
    modelName?: string;
    config?: OpenRouterConfig;
  } = {}
): Promise<[z.infer<T>, z.infer<T>]> {
  // Force temperature 0 for determinism
  const opts = { ...options, temperature: 0 };

  const [result1, result2] = await generateStructuredBatch(
    schema,
    [prompt, prompt], // Same prompt twice
    opts
  );

  return [result1, result2];
}

/**
 * Model configuration from environment variables
 */
export const OPENROUTER_MODELS = {
  /** Small/fast model for simple tasks (env: OPENROUTER_SMALL_MODEL) */
  SMALL: process.env.OPENROUTER_SMALL_MODEL || "openai/gpt-4o-mini",

  /** Large/powerful model for complex tasks (env: OPENROUTER_LARGE_MODEL) */
  LARGE: process.env.OPENROUTER_LARGE_MODEL || "openai/gpt-4o-2024-08-06",
} as const;

/**
 * List of cheap models for reference
 */
export const CHEAP_MODELS = [
  "openai/gpt-4o-mini",
  "anthropic/claude-3-haiku",
  "google/gemini-flash-1.5",
] as const;
