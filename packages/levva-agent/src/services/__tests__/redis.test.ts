import { describe, it, expect, beforeEach, mock } from "bun:test";
import { RedisService } from "../redis";
import type { IAgentRuntime } from "@elizaos/core";

// Mock Redis client
const createMockRedisClient = () => ({
  connect: mock(async () => {}),
  quit: mock(async () => {}),
  get: mock(async (key: string) => null),
  set: mock(async (key: string, value: string, options?: any) => "OK"),
  del: mock(async (...keys: string[]) => keys.length),
  keys: mock(async (pattern: string) => []),
});

// Mock runtime
const createMockRuntime = (): Partial<IAgentRuntime> => ({
  getSetting: mock((key: string) => {
    if (key === "REDIS_URL") return "redis://localhost:6379";
    return undefined;
  }),
});

describe("RedisService", () => {
  describe("JSON Serialization", () => {
    let service: RedisService;
    let mockRuntime: Partial<IAgentRuntime>;

    beforeEach(() => {
      mockRuntime = createMockRuntime();
      service = new RedisService();
    });

    it("should serialize and deserialize bigint values", async () => {
      const testValue = { amount: 1000000000000000000n };
      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.amount).toBe(1000000000000000000n);
      expect(typeof deserialized.amount).toBe("bigint");
    });

    it("should serialize and deserialize undefined values", async () => {
      const testValue = { prop: undefined };
      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.prop).toBeUndefined();
    });

    it("should serialize and deserialize Map objects", async () => {
      const testMap = new Map([
        ["key1", "value1"],
        ["key2", "value2"],
      ]);
      const testValue = { data: testMap };
      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.data).toBeInstanceOf(Map);
      expect(deserialized.data.get("key1")).toBe("value1");
      expect(deserialized.data.get("key2")).toBe("value2");
    });

    it("should serialize and deserialize Set objects", async () => {
      const testSet = new Set(["value1", "value2", "value3"]);
      const testValue = { data: testSet };
      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.data).toBeInstanceOf(Set);
      expect(deserialized.data.has("value1")).toBe(true);
      expect(deserialized.data.has("value2")).toBe(true);
      expect(deserialized.data.size).toBe(3);
    });

    it("should serialize and deserialize Date objects", async () => {
      const testDate = new Date("2024-01-01T00:00:00Z");
      const testValue = { timestamp: testDate };
      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.timestamp).toBeInstanceOf(Date);
      expect(deserialized.timestamp.getTime()).toBe(testDate.getTime());
    });

    it("should handle nested complex objects", async () => {
      const testValue = {
        user: {
          balance: 999999999999999999n,
          tokens: new Set(["ETH", "USDC"]),
          metadata: new Map([["key", "value"]]),
          createdAt: new Date("2024-01-01"),
          optional: undefined,
        },
      };

      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.user.balance).toBe(999999999999999999n);
      expect(deserialized.user.tokens).toBeInstanceOf(Set);
      expect(deserialized.user.metadata).toBeInstanceOf(Map);
      expect(deserialized.user.createdAt).toBeInstanceOf(Date);
      expect(deserialized.user.optional).toBeUndefined();
    });

    it("should handle arrays of complex types", async () => {
      const testValue = {
        amounts: [100n, 200n, 300n],
        dates: [new Date("2024-01-01"), new Date("2024-01-02")],
      };

      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.amounts[0]).toBe(100n);
      expect(deserialized.amounts[2]).toBe(300n);
      expect(deserialized.dates[0]).toBeInstanceOf(Date);
    });

    it("should handle special expiresAt field as Date", async () => {
      const testValue = {
        expiresAt: "2024-12-31T23:59:59Z",
      };

      const serialized = JSON.stringify(testValue);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.expiresAt).toBeInstanceOf(Date);
    });

    it("should preserve regular objects without special types", async () => {
      const testValue = {
        name: "test",
        count: 42,
        enabled: true,
        nested: { value: "nested" },
      };

      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized).toEqual(testValue);
    });

    it("should handle null values", async () => {
      const testValue = { value: null };
      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.value).toBeNull();
    });

    it("should handle empty objects and arrays", async () => {
      const testValue = {
        emptyObj: {},
        emptyArr: [],
        emptyMap: new Map(),
        emptySet: new Set(),
      };

      const serialized = JSON.stringify(testValue, (service as any).jsonReplacer);
      const deserialized = JSON.parse(serialized, (service as any).jsonReviver);

      expect(deserialized.emptyObj).toEqual({});
      expect(deserialized.emptyArr).toEqual([]);
      expect(deserialized.emptyMap).toBeInstanceOf(Map);
      expect(deserialized.emptyMap.size).toBe(0);
      expect(deserialized.emptySet).toBeInstanceOf(Set);
      expect(deserialized.emptySet.size).toBe(0);
    });
  });

  describe("DefaultStore", () => {
    let service: RedisService;
    let mockClient: ReturnType<typeof createMockRedisClient>;
    let mockRuntime: Partial<IAgentRuntime>;

    beforeEach(() => {
      mockRuntime = createMockRuntime();
      service = new RedisService();
      mockClient = createMockRedisClient();
      // Inject mock client
      (service as any).client = mockClient;
    });

    it("should get value from Redis and deserialize", async () => {
      const testData = { amount: 1000n, timestamp: new Date() };
      mockClient.get.mockResolvedValue(
        JSON.stringify(testData, (service as any).jsonReplacer)
      );

      const store = service.getStore("test-prefix");
      const result = await store.get("test-key");

      expect(mockClient.get).toHaveBeenCalledWith("test-prefix:test-key");
      expect(result).toBeDefined();
    });

    it("should return undefined for missing key", async () => {
      mockClient.get.mockResolvedValue(null);

      const store = service.getStore("test-prefix");
      const result = await store.get("missing-key");

      expect(result).toBeUndefined();
    });

    it("should set value without TTL", async () => {
      const testData = { value: "test" };

      const store = service.getStore("test-prefix");
      await store.set("test-key", testData);

      expect(mockClient.set).toHaveBeenCalledWith(
        "test-prefix:test-key",
        expect.any(String)
      );
      // Verify it was called without expiration options
      const callArgs = mockClient.set.mock.calls[0];
      expect(callArgs[2]).toBeUndefined();
    });

    it("should set value with TTL", async () => {
      const testData = { value: "test" };
      const ttlMs = 5000;

      const store = service.getStore("test-prefix");
      await store.set("test-key", testData, ttlMs);

      expect(mockClient.set).toHaveBeenCalledWith(
        "test-prefix:test-key",
        expect.any(String),
        {
          expiration: {
            type: "PX",
            value: ttlMs,
          },
        }
      );
    });

    it("should set value with zero TTL (immediate expiration)", async () => {
      const testData = { value: "test" };

      const store = service.getStore("test-prefix");
      await store.set("test-key", testData, 0);

      expect(mockClient.set).toHaveBeenCalledWith(
        "test-prefix:test-key",
        expect.any(String),
        {
          expiration: {
            type: "PX",
            value: 0,
          },
        }
      );
    });

    it("should delete key and return true if deleted", async () => {
      mockClient.del.mockResolvedValue(1);

      const store = service.getStore("test-prefix");
      const result = await store.delete("test-key");

      expect(mockClient.del).toHaveBeenCalledWith("test-prefix:test-key");
      expect(result).toBe(true);
    });

    it("should delete key and return false if not found", async () => {
      mockClient.del.mockResolvedValue(0);

      const store = service.getStore("test-prefix");
      const result = await store.delete("nonexistent-key");

      expect(result).toBe(false);
    });

    it("should iterate over entries", async () => {
      mockClient.keys.mockResolvedValue([
        "test-prefix:key1",
        "test-prefix:key2",
      ]);
      mockClient.get
        .mockResolvedValueOnce(JSON.stringify({ value: "value1" }))
        .mockResolvedValueOnce(JSON.stringify({ value: "value2" }));

      const store = service.getStore("test-prefix");
      const entries: [string, any][] = [];

      for await (const entry of store.entries()) {
        entries.push(entry);
      }

      expect(entries.length).toBe(2);
      expect(entries[0][0]).toBe("key1");
      expect(entries[1][0]).toBe("key2");
    });

    it("should handle serialization errors gracefully", async () => {
      const store = service.getStore("test-prefix");
      const circularObj: any = {};
      circularObj.self = circularObj;

      await expect(store.set("test-key", circularObj)).rejects.toThrow();
    });

    it("should handle deserialization errors gracefully", async () => {
      mockClient.get.mockResolvedValue("invalid json {{{");

      const store = service.getStore("test-prefix");

      await expect(store.get("test-key")).rejects.toThrow();
    });

    it("should preserve BigInt precision through serialization", async () => {
      const largeBigInt = 9007199254740991000n; // Beyond Number.MAX_SAFE_INTEGER
      const testData = { amount: largeBigInt };

      mockClient.get.mockResolvedValue(
        JSON.stringify(testData, (service as any).jsonReplacer)
      );

      const store = service.getStore("test-prefix");
      const result = await store.get("test-key");

      expect((result as any).amount).toBe(largeBigInt);
      expect(typeof (result as any).amount).toBe("bigint");
    });

    it("should handle multiple concurrent operations", async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ count: 0 }));
      mockClient.set.mockResolvedValue("OK");

      const store = service.getStore("test-prefix");

      const operations = Array.from({ length: 10 }, async (_, i) => {
        await store.set(`key-${i}`, { value: i });
        return store.get(`key-${i}`);
      });

      const results = await Promise.all(operations);
      expect(results.length).toBe(10);
    });
  });

  describe("Service Lifecycle", () => {
    it("should create stores with different prefixes", () => {
      const service = new RedisService();
      const store1 = service.getStore("prefix1");
      const store2 = service.getStore("prefix2");

      expect(store1).toBeDefined();
      expect(store2).toBeDefined();
      expect(store1).not.toBe(store2);
    });

    it("should return same store instance for same prefix", () => {
      const service = new RedisService();
      const store1 = service.getStore("same-prefix");
      const store2 = service.getStore("same-prefix");

      expect(store1).toBe(store2);
    });
  });
});