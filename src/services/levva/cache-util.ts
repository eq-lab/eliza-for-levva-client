import { IAgentRuntime } from "@elizaos/core";
import { CacheEntry } from "../../types/core";

interface CacheThisArg {
  readonly runtime: IAgentRuntime;
}

/**
 * Creates a timed cache function that caches results for a specified TTL
 * @param ttl Time to live in milliseconds
 * @param fn Function to cache
 * @param keyFn Function to generate cache key from arguments
 * @returns Cached function
 */
export function createTimedCache<TArgs extends any[], TReturn>(
  thisArg: CacheThisArg,
  ttl: number,
  fn: (...args: TArgs) => Promise<TReturn>,
  keyFn: (...args: TArgs) => string
) {
  return async (...args: TArgs): Promise<TReturn> => {
    const cacheKey = keyFn(...args);
    const cached =
      await thisArg.runtime.getCache<CacheEntry<TReturn>>(cacheKey);
    const now = Date.now();

    if (cached?.timestamp && now - cached.timestamp < ttl) {
      return cached.value;
    }

    const result = await fn(...args);
    await thisArg.runtime.setCache(cacheKey, { timestamp: now, value: result });
    return result;
  };
}

/**
 * Creates a permanent cache function that caches results indefinitely
 * @param fn Function to cache
 * @param keyFn Function to generate cache key from arguments
 * @returns Cached function
 */
export function createPermanentCache<TArgs extends any[], TReturn>(
  thisArg: CacheThisArg,
  fn: (...args: TArgs) => Promise<TReturn>,
  keyFn: (...args: TArgs) => string
) {
  return async (...args: TArgs): Promise<TReturn> => {
    const cacheKey = keyFn(...args);
    const cached = await thisArg.runtime.getCache<TReturn>(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await fn(...args);
    await thisArg.runtime.setCache(cacheKey, result);
    return result;
  };
}
