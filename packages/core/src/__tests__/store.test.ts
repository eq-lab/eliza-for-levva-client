import { describe, it, expect, beforeEach } from "bun:test";
import type { IKVStore } from "../types/store";
import { isKVStoreService } from "../types/store";

describe("IKVStore Interface", () => {
  describe("TTL Parameter", () => {
    it("should accept ttlMs parameter in set method", async () => {
      const mockStore: IKVStore<string> = {
        get: async (key: string) => undefined,
        set: async (key: string, value: string, ttlMs?: number) => {
          expect(key).toBeDefined();
          expect(value).toBeDefined();
          expect(typeof ttlMs).toBe("number");
        },
        delete: async (key: string) => true,
        entries: async function* () {
          yield ["key", "value"] as [string, string];
        },
      };

      await mockStore.set("test-key", "test-value", 1000);
    });

    it("should work without ttlMs parameter (backward compatibility)", async () => {
      const mockStore: IKVStore<string> = {
        get: async (key: string) => undefined,
        set: async (key: string, value: string, ttlMs?: number) => {
          expect(key).toBeDefined();
          expect(value).toBeDefined();
          expect(ttlMs).toBeUndefined();
        },
        delete: async (key: string) => true,
        entries: async function* () {
          yield ["key", "value"] as [string, string];
        },
      };

      await mockStore.set("test-key", "test-value");
    });

    it("should handle zero TTL", async () => {
      const mockStore: IKVStore<string> = {
        get: async (key: string) => undefined,
        set: async (key: string, value: string, ttlMs?: number) => {
          expect(ttlMs).toBe(0);
        },
        delete: async (key: string) => true,
        entries: async function* () {
          yield ["key", "value"] as [string, string];
        },
      };

      await mockStore.set("test-key", "test-value", 0);
    });

    it("should handle negative TTL values", async () => {
      const mockStore: IKVStore<string> = {
        get: async (key: string) => undefined,
        set: async (key: string, value: string, ttlMs?: number) => {
          expect(typeof ttlMs).toBe("number");
          expect(ttlMs).toBeLessThan(0);
        },
        delete: async (key: string) => true,
        entries: async function* () {
          yield ["key", "value"] as [string, string];
        },
      };

      await mockStore.set("test-key", "test-value", -100);
    });

    it("should handle very large TTL values", async () => {
      const mockStore: IKVStore<string> = {
        get: async (key: string) => undefined,
        set: async (key: string, value: string, ttlMs?: number) => {
          expect(ttlMs).toBe(Number.MAX_SAFE_INTEGER);
        },
        delete: async (key: string) => true,
        entries: async function* () {
          yield ["key", "value"] as [string, string];
        },
      };

      await mockStore.set("test-key", "test-value", Number.MAX_SAFE_INTEGER);
    });
  });

  describe("Store with Metrics", () => {
    interface TestMetrics {
      totalOperations: number;
      avgResponseTime: number;
    }

    it("should support optional metrics type parameter", async () => {
      const mockStore: IKVStore<string, TestMetrics> = {
        get: async (key: string) => "value",
        set: async (key: string, value: string, ttlMs?: number) => {},
        delete: async (key: string) => true,
        entries: async function* () {
          yield ["key", "value"] as [string, string];
        },
        getMetrics: async () => ({
          totalOperations: 100,
          avgResponseTime: 25.5,
        }),
      };

      const metrics = await mockStore.getMetrics!();
      expect(metrics.totalOperations).toBe(100);
      expect(metrics.avgResponseTime).toBe(25.5);
    });

    it("should work without metrics method", async () => {
      const mockStore: IKVStore<string> = {
        get: async (key: string) => "value",
        set: async (key: string, value: string, ttlMs?: number) => {},
        delete: async (key: string) => true,
        entries: async function* () {
          yield ["key", "value"] as [string, string];
        },
      };

      expect(mockStore.getMetrics).toBeUndefined();
    });
  });
});

describe("isKVStoreService", () => {
  it("should return true for valid KVStore service", () => {
    const mockService = {
      getStore: (name: string) => ({}) as IKVStore<any>,
    };

    expect(isKVStoreService(mockService)).toBe(true);
  });

  it("should return false for null", () => {
    expect(isKVStoreService(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isKVStoreService(undefined)).toBe(false);
  });

  it("should return false for object without getStore", () => {
    const mockService = {
      someOtherMethod: () => {},
    };

    expect(isKVStoreService(mockService)).toBe(false);
  });

  it("should return false for primitive values", () => {
    expect(isKVStoreService("string")).toBe(false);
    expect(isKVStoreService(123)).toBe(false);
    expect(isKVStoreService(true)).toBe(false);
  });

  it("should return false for arrays", () => {
    expect(isKVStoreService([])).toBe(false);
  });

  it("should handle object with getStore as non-function", () => {
    const mockService = {
      getStore: "not a function",
    };

    // The type guard checks for presence of 'getStore' property
    expect(isKVStoreService(mockService)).toBe(true);
  });
});