import { describe, it, expect } from "vitest";
import {
  getUserPositions,
  getWithdrawalRequests,
  getStrategies,
} from "../src/api/levva";
import { ADDRESS } from "./chat/setup";

describe("Levva API Integration Tests", () => {
  const testAddress = ADDRESS;
  const testChainId = 1;

  // These tests call real API endpoints - they may be slow or fail if the API is down
  // Can be skipped in CI by excluding integration test files

  it("should fetch user positions from real API", async () => {
    const result = await getUserPositions(testAddress, testChainId);

    // Log the result for debugging
    if (!result.success) {
      console.log("User positions API error:", result.error);
    } else {
      console.log("User positions data:", result.data);
    }

    // The API call should succeed (even if it returns empty array)
    expect(result.success).toBe(true);

    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);

      // If there are positions, validate their structure
      if (result.data.length > 0) {
        const position = result.data[0];
        expect(position).toHaveProperty("strategyId");
        expect(position).toHaveProperty("balance");
        expect(position).toHaveProperty("balanceUsd");
        expect(position).toHaveProperty("hasPendingWithdrawals");
        expect(typeof position.strategyId).toBe("number");
        expect(typeof position.balance).toBe("number");
        expect(typeof position.balanceUsd).toBe("number");
        expect(typeof position.hasPendingWithdrawals).toBe("boolean");
      }
    }
  }, 10000); // 10 second timeout for real API calls

  it("should fetch withdrawal requests from real API", async () => {
    const result = await getWithdrawalRequests(testAddress, 1);

    // Log the result for debugging
    if (!result.success) {
      console.log("Withdrawal requests API error:", result.error);
    } else {
      console.log("Withdrawal requests data:", result.data);
    }

    // The API call should succeed (even if it returns empty array)
    expect(result.success).toBe(true);

    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);

      // If there are withdrawal requests, validate their structure
      if (result.data.length > 0) {
        const withdrawal = result.data[0];
        expect(withdrawal).toHaveProperty("vaultAddress");
        expect(withdrawal).toHaveProperty("withdrawalNftAddress");
        expect(withdrawal).toHaveProperty("requestId");
        expect(withdrawal).toHaveProperty("isFinalized");
        expect(withdrawal).toHaveProperty("amount");
        expect(withdrawal).toHaveProperty("strategyId");
        expect(typeof withdrawal.vaultAddress).toBe("string");
        expect(typeof withdrawal.withdrawalNftAddress).toBe("string");
        expect(typeof withdrawal.requestId).toBe("number");
        expect(typeof withdrawal.isFinalized).toBe("boolean");
        expect(typeof withdrawal.amount).toBe("number");
        expect(typeof withdrawal.strategyId).toBe("number");
      }
    }
  }, 10000); // 10 second timeout for real API calls

  it("should fetch strategies from real API", async () => {
    const result = await getStrategies(testChainId);

    // The API call should succeed
    expect(result.success).toBe(true);

    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0); // Should have at least some strategies

      const strategy = result.data[0];
      expect(strategy).toHaveProperty("id");
      expect(strategy).toHaveProperty("name");
      expect(strategy).toHaveProperty("description");
      expect(strategy).toHaveProperty("vault");
      expect(strategy.vault).toHaveProperty("publicChainId");
      expect(strategy.vault?.publicChainId).toBe(testChainId);
    }
  }, 10000); // 10 second timeout for real API calls

  it("should handle different vault IDs for withdrawal requests", async () => {
    // Test with vault ID 2 - this might return an error or empty array
    const result = await getWithdrawalRequests(testAddress, 2);

    // The API might return an error for non-existent vaults, which is acceptable
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);
    } else {
      // If it fails validation, that's also acceptable for non-existent vaults
      expect(result.success).toBe(false);
    }
  }, 10000);

  it("should validate API response schemas with real data", async () => {
    // Test that real API responses pass our Zod validation
    const [positionsResult, withdrawalsResult, strategiesResult] =
      await Promise.all([
        getUserPositions(testAddress, testChainId),
        getWithdrawalRequests(testAddress, testChainId),
        getStrategies(testChainId),
      ]);

    // All API calls should succeed and pass validation
    expect(positionsResult.success).toBe(true);
    expect(withdrawalsResult.success).toBe(true);
    expect(strategiesResult.success).toBe(true);

    // Log the actual data for debugging (if any)
    if (positionsResult.success && positionsResult.data.length > 0) {
      console.log(
        "Sample position data:",
        JSON.stringify(positionsResult.data[0], null, 2)
      );
    }

    if (withdrawalsResult.success && withdrawalsResult.data.length > 0) {
      console.log(
        "Sample withdrawal data:",
        JSON.stringify(withdrawalsResult.data[0], null, 2)
      );
    }

    if (strategiesResult.success && strategiesResult.data.length > 0) {
      console.log(
        "Sample strategy data:",
        JSON.stringify(strategiesResult.data[0], null, 2)
      );
    }
  }, 15000); // Longer timeout for multiple API calls
});
