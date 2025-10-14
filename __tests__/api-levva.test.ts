import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getUserPositions, getWithdrawalRequests } from "../src/api/levva";
import {
  userPositionsResponseSchema,
  withdrawalRequestsResponseSchema,
} from "../src/api/levva/schema";
import { ADDRESS } from "./chat/setup";

describe("Levva API", () => {
  const testAddress = ADDRESS;
  const testChainId = 1;

  describe("Unit Tests", () => {
    // Mock fetch for unit tests
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      // @ts-expect-error - moock type conflict
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("getUserPositions", () => {
      it("should handle successful API response", async () => {
        const mockData = [
          {
            strategyId: 1,
            balance: 3.37049,
            balanceUsd: 3.355171,
            hasPendingWithdrawals: true,
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        });

        const result = await getUserPositions(testAddress, testChainId);

        expect(mockFetch).toHaveBeenCalledWith(
          `https://levva.fi/api/v1/strategies/user-positions/${testAddress}?PublicChainId=${testChainId}`
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(mockData);
        }
      });

      it("should handle empty response", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });

        const result = await getUserPositions(testAddress, testChainId);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([]);
        }
      });

      it("should handle network errors", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));
        await expect(
          getUserPositions(testAddress, testChainId)
        ).rejects.toThrow("Network error");
      });
    });

    describe("getWithdrawalRequests", () => {
      it("should handle successful API response", async () => {
        const mockData = [
          {
            vaultAddress: "0x59A8ea46F3804B69fA8C5ba9484D6fDaAB7c7fa3",
            withdrawalNftAddress: "0xE43FC1E799817883C34BbaEe998e782899BaA982",
            requestId: 1,
            isFinalized: true,
            amount: 0.005,
            strategyId: 9,
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        });

        const result = await getWithdrawalRequests(testAddress, 1);

        expect(mockFetch).toHaveBeenCalledWith(
          `https://levva.fi/api/v2/vaults/1/withdrawal-requests/${testAddress}`
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(mockData);
        }
      });

      it("should handle different vault IDs", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });

        await getWithdrawalRequests(testAddress, 2);
        expect(mockFetch).toHaveBeenCalledWith(
          `https://levva.fi/api/v2/vaults/2/withdrawal-requests/${testAddress}`
        );
      });
    });
  });

  describe("Schema Validation", () => {
    it("should validate user position schema correctly", () => {
      const validPosition = {
        strategyId: 1,
        balance: 3.37049,
        balanceUsd: 3.355171,
        hasPendingWithdrawals: true,
      };

      const result = userPositionsResponseSchema.safeParse([validPosition]);
      expect(result.success).toBe(true);
    });

    it("should validate withdrawal request schema correctly", () => {
      const validWithdrawal = {
        vaultAddress: "0x59A8ea46F3804B69fA8C5ba9484D6fDaAB7c7fa3",
        withdrawalNftAddress: "0xE43FC1E799817883C34BbaEe998e782899BaA982",
        requestId: 1,
        isFinalized: true,
        amount: 0.005,
        strategyId: 9,
      };

      const result = withdrawalRequestsResponseSchema.safeParse([
        validWithdrawal,
      ]);
      expect(result.success).toBe(true);
    });

    it("should fail validation with invalid position data", () => {
      const invalidPosition = {
        strategyId: "invalid", // should be number
        balance: "invalid", // should be number
        balanceUsd: "invalid", // should be number
        hasPendingWithdrawals: "invalid", // should be boolean
      };

      const result = userPositionsResponseSchema.safeParse([invalidPosition]);
      expect(result.success).toBe(false);
    });

    it("should fail validation with invalid withdrawal data", () => {
      const invalidWithdrawal = {
        vaultAddress: "invalid", // should be valid address format
        withdrawalNftAddress: "invalid", // should be valid address format
        requestId: "invalid", // should be number
        isFinalized: "invalid", // should be boolean
        amount: "invalid", // should be number
        strategyId: "invalid", // should be number
      };

      const result = withdrawalRequestsResponseSchema.safeParse([
        invalidWithdrawal,
      ]);
      expect(result.success).toBe(false);
    });
  });
});
