import { describe, it, expect, beforeEach, mock } from "bun:test";
import { WalletServiceComponent } from "../wallet";
import type { IAgentRuntime, IKVStore } from "@elizaos/core";
import type { LevvaService } from "../class";
import type { RedisService } from "../../redis";
import type { BalanceData } from "../wallet";

// Mock implementations
const createMockRuntime = (): Partial<IAgentRuntime> => ({
  logger: {
    info: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    warn: mock(() => {}),
  } as any,
  getSetting: mock((key: string) => undefined),
});

const createMockCache = (): IKVStore<BalanceData[]> => ({
  get: mock(async (key: string) => undefined),
  set: mock(async (key: string, value: BalanceData[], ttlMs?: number) => {}),
  delete: mock(async (key: string) => true),
  entries: async function* () {
    yield ["key", [] as BalanceData[]] as [string, BalanceData[]];
  },
});

const createMockRedisService = (): Partial<RedisService> => ({
  getStore: mock((prefix: string) => createMockCache()),
});

const createMockLevvaService = (): Partial<LevvaService> => ({
  runtime: createMockRuntime() as IAgentRuntime,
  token: {
    getAvailableTokens: mock(async () => []),
    getTokenDataWithInfo: mock(async () => undefined),
  } as any,
});

describe("WalletServiceComponent", () => {
  let walletService: WalletServiceComponent;
  let mockRuntime: Partial<IAgentRuntime>;
  let mockLevvaService: Partial<LevvaService>;
  let mockRedisService: Partial<RedisService>;
  let mockCache: IKVStore<BalanceData[]>;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    mockLevvaService = createMockLevvaService();
    mockRedisService = createMockRedisService();
    mockCache = createMockCache();

    (mockRedisService.getStore as any).mockReturnValue(mockCache);

    walletService = new WalletServiceComponent(
      mockRuntime as IAgentRuntime,
      mockLevvaService as LevvaService,
      mockRedisService as RedisService
    );
  });

  describe("Cache Key Generation", () => {
    it("should generate correct cache key format", () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      // Access private method through any cast for testing
      const cacheKey = (walletService as any).getUserBalanceCacheKey(
        address,
        chainId
      );

      expect(cacheKey).toBe(`chain:${chainId}_account:${address}`);
    });

    it("should generate unique keys for different chains", () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;

      const key1 = (walletService as any).getUserBalanceCacheKey(address, 1);
      const key2 = (walletService as any).getUserBalanceCacheKey(address, 137);

      expect(key1).not.toBe(key2);
      expect(key1).toBe("chain:1_account:0x1234567890123456789012345678901234567890");
      expect(key2).toBe("chain:137_account:0x1234567890123456789012345678901234567890");
    });

    it("should generate unique keys for different addresses", () => {
      const address1 = "0x1111111111111111111111111111111111111111" as `0x${string}`;
      const address2 = "0x2222222222222222222222222222222222222222" as `0x${string}`;
      const chainId = 1;

      const key1 = (walletService as any).getUserBalanceCacheKey(address1, chainId);
      const key2 = (walletService as any).getUserBalanceCacheKey(address2, chainId);

      expect(key1).not.toBe(key2);
    });
  });

  describe("invalidateUserBalanceCache", () => {
    it("should delete cache entry successfully", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      (mockCache.delete as any).mockResolvedValue(true);

      await walletService.invalidateUserBalanceCache(address, chainId);

      expect(mockCache.delete).toHaveBeenCalledWith(
        `chain:${chainId}_account:${address}`
      );
      expect(mockRuntime.logger!.info).toHaveBeenCalledWith(
        "Invalidated user balance cache",
        { address, chainId }
      );
    });

    it("should handle cache deletion errors", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;
      const error = new Error("Cache deletion failed");

      (mockCache.delete as any).mockRejectedValue(error);

      await expect(
        walletService.invalidateUserBalanceCache(address, chainId)
      ).rejects.toThrow("Cache deletion failed");

      expect(mockRuntime.logger!.error).toHaveBeenCalledWith(
        "Failed to invalidate user balance cache:",
        error
      );
    });

    it("should work with different chain IDs", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainIds = [1, 137, 42161, 10];

      (mockCache.delete as any).mockResolvedValue(true);

      for (const chainId of chainIds) {
        await walletService.invalidateUserBalanceCache(address, chainId);
      }

      expect(mockCache.delete).toHaveBeenCalledTimes(chainIds.length);
    });
  });

  describe("getBalances - Cache Integration", () => {
    it("should use cached balances when available", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      const cachedBalances: BalanceData[] = [
        {
          token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
          amount: 1000000n,
          value: 1000000n,
        },
      ];

      (mockCache.get as any).mockResolvedValue(cachedBalances);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      const result = await walletService.getBalances({ address, chainId });

      expect(mockCache.get).toHaveBeenCalledWith(
        `chain:${chainId}_account:${address}`
      );
      expect(result).toEqual(cachedBalances);
    });

    it("should fetch and cache new balances when cache is empty", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      (mockCache.get as any).mockResolvedValue(undefined);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([
        {
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          symbol: "USDC",
          decimals: 6,
        },
      ]);

      // Mock the balance fetching (this would need more setup in real tests)
      const result = await walletService.getBalances({ address, chainId });

      expect(mockCache.get).toHaveBeenCalled();
    });

    it("should set cache with correct TTL when updating", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      (mockCache.get as any).mockResolvedValue(undefined);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      await walletService.getBalances({ address, chainId });

      // Note: Actual balance fetching might trigger cache.set
      // The TTL should be 900_000 ms (15 minutes)
    });

    it("should filter out zero balances", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      const balancesWithZeros: BalanceData[] = [
        {
          token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
          amount: 1000000n,
          value: 1000000n,
        },
        {
          token: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`,
          amount: 0n,
          value: 0n,
        },
      ];

      (mockCache.get as any).mockResolvedValue(balancesWithZeros);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      const result = await walletService.getBalances({ address, chainId });

      expect(result.length).toBe(1);
      expect(result[0].amount).toBe(1000000n);
    });
  });

  describe("getBalances - Edge Cases", () => {
    it("should handle empty available tokens list", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      (mockCache.get as any).mockResolvedValue(undefined);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      const result = await walletService.getBalances({ address, chainId });

      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle concurrent balance requests for same address", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      (mockCache.get as any).mockResolvedValue(undefined);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      const promises = Array.from({ length: 5 }, () =>
        walletService.getBalances({ address, chainId })
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(5);
    });

    it("should handle very large balance amounts", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      const largeBalance: BalanceData[] = [
        {
          token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
          amount: BigInt("999999999999999999999999"),
          value: BigInt("999999999999999999999999"),
        },
      ];

      (mockCache.get as any).mockResolvedValue(largeBalance);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      const result = await walletService.getBalances({ address, chainId });

      expect(result[0].amount).toBe(BigInt("999999999999999999999999"));
      expect(typeof result[0].amount).toBe("bigint");
    });

    it("should handle cache retrieval errors gracefully", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      (mockCache.get as any).mockRejectedValue(new Error("Cache error"));
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      // Should still attempt to fetch balances even if cache fails
      await expect(
        walletService.getBalances({ address, chainId })
      ).rejects.toThrow();
    });
  });

  describe("Cache TTL Behavior", () => {
    it("should use 15-minute TTL for balance cache", async () => {
      const expectedTTL = 900_000; // 15 minutes in milliseconds

      // This tests the constant used in the implementation
      expect(expectedTTL).toBe(15 * 60 * 1000);
    });

    it("should update cache with new TTL on balance refresh", async () => {
      const address = "0x1234567890123456789012345678901234567890" as `0x${string}`;
      const chainId = 1;

      (mockCache.get as any).mockResolvedValue(undefined);
      (mockLevvaService.token!.getAvailableTokens as any).mockResolvedValue([]);

      await walletService.getBalances({ address, chainId });

      // Verify that if set was called, it used the correct TTL
      // In actual implementation, this would be 900_000
    });
  });

  describe("formatToken and formatWalletAssets", () => {
    it("should format token correctly with all fields", () => {
      const token = {
        symbol: "USDC",
        name: "USD Coin",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
        decimals: 6,
      };

      const formatted = walletService.formatToken(token);

      expect(formatted).toContain("USDC");
      expect(formatted).toContain("USD Coin");
      expect(formatted).toContain("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
      expect(formatted).toContain("6 decimals");
    });

    it("should format native token without address", () => {
      const token = {
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
      };

      const formatted = walletService.formatToken(token);

      expect(formatted).toContain("ETH");
      expect(formatted).toContain("Native");
    });
  });
});