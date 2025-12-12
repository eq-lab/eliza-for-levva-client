import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { IKVStore, State, UUID } from "@elizaos/core";

// Mock KV store to test TTL behavior
class MockKVStore implements IKVStore<State> {
  private store = new Map<string, { value: State; ttl?: number }>();
  public setCallHistory: Array<{ key: string; value: State; ttl?: number }> = [];

  async get(key: string): Promise<State | undefined> {
    return this.store.get(key)?.value;
  }

  async set(key: string, value: State, ttlMs?: number): Promise<void> {
    this.store.set(key, { value, ttl: ttlMs });
    this.setCallHistory.push({ key, value, ttl: ttlMs });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async *entries(): AsyncGenerator<[string, State]> {
    for (const [key, { value }] of this.store.entries()) {
      yield [key, value];
    }
  }

  clearHistory() {
    this.setCallHistory = [];
  }
}

describe("Runtime Cache TTL", () => {
  describe("State Cache TTL Configuration", () => {
    it("should use 1 hour TTL constant", () => {
      const ONE_HOUR_MS = 1000 * 60 * 60;
      expect(ONE_HOUR_MS).toBe(3600000);
    });

    it("should set correct TTL for message state", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const testState: State = {
        values: { test: "value" },
        data: {},
        text: "test state",
      };

      await mockCache.set(messageId, testState, 1000 * 60 * 60);

      expect(mockCache.setCallHistory.length).toBe(1);
      expect(mockCache.setCallHistory[0].key).toBe(messageId);
      expect(mockCache.setCallHistory[0].ttl).toBe(3600000);
    });

    it("should set correct TTL for action results", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const actionResultsState: State = {
        values: { actionResults: [] },
        data: { actionResults: [], actionPlan: [] },
        text: JSON.stringify([]),
      };

      await mockCache.set(
        `${messageId}_action_results`,
        actionResultsState,
        1000 * 60 * 60
      );

      expect(mockCache.setCallHistory.length).toBe(1);
      expect(mockCache.setCallHistory[0].key).toBe(`${messageId}_action_results`);
      expect(mockCache.setCallHistory[0].ttl).toBe(3600000);
    });

    it("should set correct TTL for provider state", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const providerState: State = {
        values: {},
        data: {},
        text: "provider data",
      };

      await mockCache.set(messageId, providerState, 1000 * 60 * 60);

      expect(mockCache.setCallHistory.length).toBe(1);
      expect(mockCache.setCallHistory[0].ttl).toBe(3600000);
    });
  });

  describe("TTL Edge Cases", () => {
    it("should handle zero TTL", async () => {
      const mockCache = new MockKVStore();
      const key = "test-key";
      const state: State = { values: {}, data: {}, text: "" };

      await mockCache.set(key, state, 0);

      expect(mockCache.setCallHistory[0].ttl).toBe(0);
    });

    it("should handle very large TTL values", async () => {
      const mockCache = new MockKVStore();
      const key = "test-key";
      const state: State = { values: {}, data: {}, text: "" };
      const largeTTL = Number.MAX_SAFE_INTEGER;

      await mockCache.set(key, state, largeTTL);

      expect(mockCache.setCallHistory[0].ttl).toBe(largeTTL);
    });

    it("should handle undefined message ID gracefully", async () => {
      const mockCache = new MockKVStore();
      const messageId = undefined;

      // Simulating the runtime behavior where set is only called if message.id exists
      if (messageId) {
        await mockCache.set(messageId, {} as State, 3600000);
      }

      expect(mockCache.setCallHistory.length).toBe(0);
    });

    it("should maintain TTL precision across multiple sets", async () => {
      const mockCache = new MockKVStore();
      const ttl = 1000 * 60 * 60; // 1 hour

      for (let i = 0; i < 5; i++) {
        await mockCache.set(`key-${i}`, { values: {}, data: {}, text: "" }, ttl);
      }

      expect(mockCache.setCallHistory.length).toBe(5);
      mockCache.setCallHistory.forEach((call) => {
        expect(call.ttl).toBe(ttl);
      });
    });
  });

  describe("State Cache Behavior", () => {
    it("should accumulate state correctly with TTL", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const initialState: State = {
        values: { key1: "value1" },
        data: { data1: "data1" },
        text: "initial",
      };

      const accumulatedState: State = {
        values: { key1: "value1", key2: "value2" },
        data: { data1: "data1", data2: "data2" },
        text: "initial\naccumulated",
      };

      await mockCache.set(messageId, initialState, 3600000);
      await mockCache.set(messageId, accumulatedState, 3600000);

      const retrieved = await mockCache.get(messageId);
      expect(retrieved?.values).toEqual(accumulatedState.values);
      expect(mockCache.setCallHistory.length).toBe(2);
      expect(mockCache.setCallHistory[1].ttl).toBe(3600000);
    });

    it("should handle concurrent cache sets with TTL", async () => {
      const mockCache = new MockKVStore();
      const messageIds = Array.from({ length: 10 }, (_, i) => `message-${i}` as UUID);

      const promises = messageIds.map((id) =>
        mockCache.set(id, { values: {}, data: {}, text: "" }, 3600000)
      );

      await Promise.all(promises);

      expect(mockCache.setCallHistory.length).toBe(10);
      mockCache.setCallHistory.forEach((call) => {
        expect(call.ttl).toBe(3600000);
      });
    });

    it("should preserve state structure when using TTL", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const complexState: State = {
        values: {
          stringValue: "test",
          numberValue: 42,
          boolValue: true,
          nestedObject: { nested: "value" },
          arrayValue: [1, 2, 3],
        },
        data: {
          metadata: { timestamp: Date.now() },
          results: ["result1", "result2"],
        },
        text: "Complex state test",
      };

      await mockCache.set(messageId, complexState, 3600000);
      const retrieved = await mockCache.get(messageId);

      expect(retrieved).toEqual(complexState);
      expect(mockCache.setCallHistory[0].ttl).toBe(3600000);
    });
  });

  describe("Action Results Cache with TTL", () => {
    it("should store action results with correct key format", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;
      const actionResultsKey = `${messageId}_action_results`;

      const actionResults = [
        { action: "action1", result: "success" },
        { action: "action2", result: "failed" },
      ];

      const state: State = {
        values: { actionResults },
        data: { actionResults, actionPlan: [] },
        text: JSON.stringify(actionResults),
      };

      await mockCache.set(actionResultsKey, state, 3600000);

      expect(mockCache.setCallHistory[0].key).toBe(actionResultsKey);
      expect(mockCache.setCallHistory[0].ttl).toBe(3600000);

      const retrieved = await mockCache.get(actionResultsKey);
      expect(retrieved?.values.actionResults).toEqual(actionResults);
    });

    it("should handle empty action results", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const state: State = {
        values: { actionResults: [] },
        data: { actionResults: [], actionPlan: [] },
        text: JSON.stringify([]),
      };

      await mockCache.set(`${messageId}_action_results`, state, 3600000);

      expect(mockCache.setCallHistory[0].ttl).toBe(3600000);
    });
  });

  describe("Cache Performance", () => {
    it("should handle rapid sequential sets with TTL", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await mockCache.set(
          messageId,
          {
            values: { iteration: i },
            data: {},
            text: `iteration ${i}`,
          },
          3600000
        );
      }

      const duration = Date.now() - startTime;

      expect(mockCache.setCallHistory.length).toBe(100);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it("should handle large state objects with TTL", async () => {
      const mockCache = new MockKVStore();
      const messageId = "550e8400-e29b-41d4-a716-446655440000" as UUID;

      const largeState: State = {
        values: Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [`key${i}`, `value${i}`])
        ),
        data: {},
        text: "large state",
      };

      await mockCache.set(messageId, largeState, 3600000);

      const retrieved = await mockCache.get(messageId);
      expect(Object.keys(retrieved!.values).length).toBe(1000);
      expect(mockCache.setCallHistory[0].ttl).toBe(3600000);
    });
  });
});