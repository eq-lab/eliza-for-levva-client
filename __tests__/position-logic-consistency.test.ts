import { describe, it, expect } from "vitest";
import {
  createPositionSummary,
  type UserPosition,
  type WithdrawalRequest,
  type Strategy,
} from "../src/services/levva/positions";

describe("Position Data Consistency", () => {
  const mockStrategies: Strategy[] = [
    {
      id: 1,
      name: "Strategy 1",
      description: "Test strategy",
      shortDescription: "Test",
      backgroundColor: null,
      type: "Safe",
      category: "DeFi",
      risk: "Low",
      minimumEfficientDeposit: 100,
      liquidityAvailability: "Instant",
      vault: {
        id: 1,
        publicChainId: 1,
        address: "0x123",
        name: "Test Vault",
        underlyingToken: {
          address: "0x456",
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          priceUsd: 1,
        },
        lpToken: {
          address: "0x789",
          symbol: "LP",
          name: "LP Token",
          decimals: 18,
          priceUsd: 1,
        },
        lpTotalSupply: 1000,
        performanceFee: 0.1,
        managementFee: 0.02,
        totalAssets: 1000,
        currentApy: 0.05,
        minDeposit: 1,
        createdAt: "2023-01-01T00:00:00Z",
      },
    },
  ];

  describe("Withdrawal Status Logic", () => {
    it("should be true when positions have pending withdrawals flag", () => {
      const positions: UserPosition[] = [
        {
          strategyId: 1,
          balance: 100,
          balanceUsd: 100,
          hasPendingWithdrawals: true,
        },
        {
          strategyId: 2,
          balance: 50,
          balanceUsd: 50,
          hasPendingWithdrawals: false,
        },
      ];
      const withdrawals: WithdrawalRequest[] = [
        {
          requestId: 1,
          strategyId: 1,
          amount: 50,
          isFinalized: false, // This makes it pending
          createdAt: "2023-01-01T00:00:00Z",
        },
      ];

      const summary = createPositionSummary(
        positions,
        withdrawals,
        mockStrategies
      );

      // Should be true because position 1 has pending withdrawals
      expect(summary.hasPendingWithdrawals).toBe(true);

      // Summary should reflect this in the formatted text
      expect(summary.positionsSummary).toContain("Pending withdrawals");
    });

    it("should be true when withdrawal requests exist but position flags are false", () => {
      const positions: UserPosition[] = [
        {
          strategyId: 1,
          balance: 100,
          balanceUsd: 100,
          hasPendingWithdrawals: false,
        },
      ];
      const withdrawals: WithdrawalRequest[] = [
        {
          vaultAddress: "0x123",
          withdrawalNftAddress: "0x456",
          requestId: 1,
          isFinalized: false,
          amount: 10,
          strategyId: 1,
        },
      ];

      const summary = createPositionSummary(
        positions,
        withdrawals,
        mockStrategies
      );

      // Should be true because of unfinalized withdrawal request
      expect(summary.hasPendingWithdrawals).toBe(true);
    });

    it("should be true when both position flags and withdrawal requests indicate pending withdrawals", () => {
      const positions: UserPosition[] = [
        {
          strategyId: 1,
          balance: 100,
          balanceUsd: 100,
          hasPendingWithdrawals: true,
        },
      ];
      const withdrawals: WithdrawalRequest[] = [
        {
          vaultAddress: "0x123",
          withdrawalNftAddress: "0x456",
          requestId: 1,
          isFinalized: false,
          amount: 10,
          strategyId: 1,
        },
      ];

      const summary = createPositionSummary(
        positions,
        withdrawals,
        mockStrategies
      );

      // Should be true because both sources indicate pending withdrawals
      expect(summary.hasPendingWithdrawals).toBe(true);
    });

    it("should be false when no pending withdrawals exist anywhere", () => {
      const positions: UserPosition[] = [
        {
          strategyId: 1,
          balance: 100,
          balanceUsd: 100,
          hasPendingWithdrawals: false,
        },
        {
          strategyId: 2,
          balance: 50,
          balanceUsd: 50,
          hasPendingWithdrawals: false,
        },
      ];
      const withdrawals: WithdrawalRequest[] = [
        {
          vaultAddress: "0x123",
          withdrawalNftAddress: "0x456",
          requestId: 1,
          isFinalized: true, // Finalized = not pending
          amount: 10,
          strategyId: 1,
        },
      ];

      const summary = createPositionSummary(
        positions,
        withdrawals,
        mockStrategies
      );

      // Should be false because no pending withdrawals exist
      expect(summary.hasPendingWithdrawals).toBe(false);

      // Summary should not contain "Pending withdrawals"
      expect(summary.positionsSummary).not.toContain("Pending withdrawals");
    });

    it("should be false when no positions and no withdrawals exist", () => {
      const positions: UserPosition[] = [];
      const withdrawals: WithdrawalRequest[] = [];

      const summary = createPositionSummary(
        positions,
        withdrawals,
        mockStrategies
      );

      expect(summary.hasPendingWithdrawals).toBe(false);
      expect(summary.hasPositions).toBe(false);
    });
  });

  describe("Data Validation", () => {
    it("should maintain consistency between individual position details and overall status", () => {
      const positions: UserPosition[] = [
        {
          strategyId: 1,
          balance: 100,
          balanceUsd: 100,
          hasPendingWithdrawals: true,
        },
        {
          strategyId: 2,
          balance: 50,
          balanceUsd: 50,
          hasPendingWithdrawals: false,
        },
      ];
      const withdrawals: WithdrawalRequest[] = [
        {
          requestId: 1,
          strategyId: 1,
          amount: 50,
          isFinalized: false,
          createdAt: "2023-01-01T00:00:00Z",
        },
      ];

      const summary = createPositionSummary(
        positions,
        withdrawals,
        mockStrategies
      );

      // If any position has pending withdrawals, overall status should be true
      expect(summary.hasPendingWithdrawals).toBe(true);

      // The formatted summary should show which positions have pending withdrawals
      const lines = summary.positionsSummary.split("\n");
      expect(lines[0]).toContain("Pending withdrawals"); // Strategy 1
      expect(lines[1]).not.toContain("Pending withdrawals"); // Strategy 2 (if exists)
    });

    it("should handle edge case with empty strategy data", () => {
      const positions: UserPosition[] = [
        {
          strategyId: 999,
          balance: 100,
          balanceUsd: 100,
          hasPendingWithdrawals: true,
        }, // Non-existent strategy
      ];
      const withdrawals: WithdrawalRequest[] = [
        {
          requestId: 1,
          strategyId: 999,
          amount: 50,
          isFinalized: false,
          createdAt: "2023-01-01T00:00:00Z",
        },
      ];

      const summary = createPositionSummary(positions, withdrawals, []); // Empty strategies

      expect(summary.hasPendingWithdrawals).toBe(true);
      expect(summary.positionsSummary).toContain("Strategy 999"); // Fallback name
      expect(summary.positionsSummary).toContain("Pending withdrawals");
    });
  });

  describe("Regression Prevention", () => {
    it("should prevent the original bug scenario", () => {
      // Simulate the original bug scenario from the user report
      const positions: UserPosition[] = [
        {
          strategyId: 1,
          balance: 3.37049,
          balanceUsd: 3.36,
          hasPendingWithdrawals: true,
        },
        {
          strategyId: 5,
          balance: 1,
          balanceUsd: 1.0,
          hasPendingWithdrawals: false,
        },
        {
          strategyId: 9,
          balance: 0.005,
          balanceUsd: 21.57,
          hasPendingWithdrawals: true,
        },
        {
          strategyId: 7,
          balance: 2,
          balanceUsd: 2.0,
          hasPendingWithdrawals: false,
        },
      ];
      const withdrawals: WithdrawalRequest[] = [
        {
          requestId: 1,
          strategyId: 1,
          amount: 1.5,
          isFinalized: false,
          createdAt: "2023-01-01T00:00:00Z",
        },
        {
          requestId: 2,
          strategyId: 9,
          amount: 0.002,
          isFinalized: false,
          createdAt: "2023-01-01T00:00:00Z",
        },
      ]; // Now properly represents pending withdrawals

      const summary = createPositionSummary(
        positions,
        withdrawals,
        mockStrategies
      );

      // This should be true because positions 1 and 9 have pending withdrawals
      expect(summary.hasPendingWithdrawals).toBe(true);

      // The summary should acknowledge pending withdrawals
      expect(summary.positionsSummary).toContain("Pending withdrawals");

      // Total should be correct
      expect(summary.totalPositionValue).toBe(27.93);
    });
  });
});
