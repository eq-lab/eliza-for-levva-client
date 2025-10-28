import {
  type IAgentRuntime,
  type IKVStoreService,
  type IKVStore,
  Service,
  ServiceType,
} from "@elizaos/core";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

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
    return value
      ? JSON.parse(value, (k, v) => {
          if (k === "expiresAt") {
            return new Date(v);
          }

          return v;
        })
      : undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    await this.client.set(`${this.prefix}:${key}`, JSON.stringify(value));
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
