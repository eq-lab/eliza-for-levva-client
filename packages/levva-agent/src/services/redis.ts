import {
  type IAgentRuntime,
  type IKVStoreService,
  type IKVStore,
  Service,
  ServiceType,
} from "@elizaos/core";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return { __type: "bigint", value: value.toString() };
  }
  if (value === undefined) {
    return { __type: "undefined" };
  }
  if (value instanceof Map) {
    return { __type: "map", value: Array.from(value.entries()) };
  }
  if (value instanceof Set) {
    return { __type: "set", value: Array.from(value) };
  }
  if (value instanceof Date) {
    return { __type: "date", value: value.toISOString() };
  }
  return value;
}

/**
 * Custom JSON reviver that restores serialized types
 */
function jsonReviver(key: string, value: unknown): unknown {
  if (key === "expiresAt") {
    return new Date(value as any);
  }

  if (value && typeof value === "object" && "__type" in value) {
    const typed = value as { __type: string; value?: unknown };
    switch (typed.__type) {
      case "bigint":
        return BigInt(typed.value as string);
      case "undefined":
        return undefined;
      case "map":
        return new Map(typed.value as [unknown, unknown][]);
      case "set":
        return new Set(typed.value as unknown[]);
      case "date":
        return new Date(typed.value as string);
    }
  }
  return value;
}

function safeStringify(value: unknown): string {
  return JSON.stringify(value, jsonReplacer);
}

function safeParse<T>(value: string): T {
  return JSON.parse(value, jsonReviver) as T;
}

/*
interface SessionMetrics {
  totalCreated: number;
  totalExpired: number;
  totalDeleted: number;
  expiringSoon: number;
  peakConcurrent: number;
}
*/

class DefaultStore implements IKVStore<unknown> {
  constructor(
    private client: RedisClient,
    private prefix: string
  ) {}
  async get(key: string): Promise<unknown | undefined> {
    const value = await this.client.get(`${this.prefix}:${key}`);
    return value ? safeParse(value) : undefined;
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const serialized = safeStringify(value);

    if (ttlMs) {
      await this.client.set(`${this.prefix}:${key}`, serialized, {
        expiration: {
          type: "PX",
          value: ttlMs,
        },
      });
    } else {
      await this.client.set(`${this.prefix}:${key}`, serialized);
    }
  }
  async delete(key: string): Promise<boolean> {
    return (await this.client.del(`${this.prefix}:${key}`)) > 0;
  }
  async *entries(): AsyncGenerator<[string, unknown]> {
    const keys = await this.client.keys(`${this.prefix}:*`);
    for (const key of keys) {
      const value = await this.get(key.replace(`${this.prefix}:`, ""));
      yield [key, value] as const;
    }
  }
}

export class RedisService extends Service implements IKVStoreService {
  readonly capabilityDescription = "Redis key-value store service";
  static serviceType = ServiceType.KV_STORE;
  private url: string;
  private client?: RedisClient;

  constructor(runtime: IAgentRuntime) {
    super();
    this.runtime = runtime;

    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL is not set");
    }

    this.url = process.env.REDIS_URL;
  }

  static async start(runtime: IAgentRuntime): Promise<RedisService> {
    const service = new RedisService(runtime);
    await service.init();
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    const service = runtime.getService(ServiceType.KV_STORE);

    if (service) {
      await service.stop();
    }
  }

  async stop() {
    this.runtime.logger.info("*** Stopping Redis service ***");
    await this.client?.disconnect();
  }

  private async init() {
    this.client = createClient({ url: this.url });

    this.client.on("error", (error) => {
      this.runtime.logger.error("Redis error:", error);
    });

    await this.client.connect();
  }

  getStore(name: string): IKVStore<any, any> {
    if (!this.client) {
      throw new Error("Redis client not initialized");
    }

    return new DefaultStore(this.client, name);
  }
}
