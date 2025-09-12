import { describe, it, expect, beforeEach, vi } from "vitest";
import { action as withdrawAction } from "../src/actions/withdraw";
import { createMockRuntime } from "./utils/core-test-utils";

// Mock the rephrase utility
vi.mock("../src/util/generate", () => ({
  rephrase: vi.fn().mockImplementation(({ content }) => {
    // Return the content string if it's already a string, otherwise return the text property
    return Promise.resolve(
      typeof content === "string" ? content : content.text || content
    );
  }),
}));

// Mock the action results utility
vi.mock("../src/util/action-results", () => ({
  getPreviousReplyContext: vi.fn().mockResolvedValue([]),
}));

// Mock the withdraw params provider to avoid LLM calls in tests
vi.mock("../src/providers/withdraw-params", () => ({
  WITHDRAW_PARAMS_PROVIDER_NAME: "WITHDRAW_PARAMS",
  withdrawParamsProvider: {
    name: "WITHDRAW_PARAMS",
    description: "Extracts withdrawal parameters from user messages using LLM",
    get: vi.fn().mockResolvedValue({
      text: "Extracted withdrawal parameters",
      data: {
        userAddress: "0x1234567890123456789012345678901234567890",
        strategyId: 1,
        amount: 100,
        withdrawalStep: "request",
      },
    }),
  },
}));

// Mock the Levva API
vi.mock("../src/api/levva", () => ({
  getStrategies: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: 1,
        name: "Test Strategy",
        category: "Vault",
        vault: {
          address: "0xvault123",
          publicChainId: 1,
        },
      },
      {
        id: 2,
        name: "Pool Strategy",
        category: "Pool",
      },
    ],
  }),
}));

describe("Withdraw Action", () => {
  let mockRuntime: any;
  let mockLevvaService: any;
  let mockCallback: any;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    mockCallback = vi.fn();

    // Add logger mock
    mockRuntime.logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Mock LevvaService
    mockLevvaService = {
      getUserPositions: vi.fn().mockResolvedValue([
        { strategyId: 1, balance: 1000, balanceUsd: 1000 },
        { strategyId: 2, balance: 500, balanceUsd: 500 },
      ]),
      getWithdrawalRequests: vi.fn(),
      getStrategies: vi.fn(),
      encodeRequestRedeem: vi.fn(),
      encodeClaimWithdrawal: vi.fn(),
      createCalldata: vi.fn().mockResolvedValue("mock-calldata-hash"),
    };

    mockRuntime.getService = vi.fn().mockReturnValue(mockLevvaService);
    mockRuntime.composeState = vi.fn().mockResolvedValue({
      data: {
        providers: {
          WITHDRAW_PARAMS: {
            text: "Extracted withdrawal parameters",
            data: {
              userAddress: "0x1234567890123456789012345678901234567890",
              strategyId: 1,
              amount: 100,
              withdrawalStep: "request",
            },
          },
        },
      },
    });
  });

  describe("Validation", () => {
    it("should validate withdrawal keywords", async () => {
      const message = {
        content: { text: "I want to withdraw 100 USDC from my position" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
          chainId: 1,
        },
      };

      const isValid = await withdrawAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it("should validate redeem keywords", async () => {
      const message = {
        content: { text: "redeem all my funds from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
          chainId: 1,
        },
      };

      const isValid = await withdrawAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it("should validate cash out keywords", async () => {
      const message = {
        content: { text: "cash out everything from my vault" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
          chainId: 1,
        },
      };

      const isValid = await withdrawAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it("should validate claim keywords", async () => {
      const message = {
        content: { text: "claim my withdrawal request #123" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
          chainId: 1,
        },
      };

      const isValid = await withdrawAction.validate(mockRuntime, message);
      expect(isValid).toBe(true);
    });

    it("should reject unrelated messages", async () => {
      const message = {
        content: { text: "what's the weather like today?" },
      };

      const isValid = await withdrawAction.validate(mockRuntime, message);
      expect(isValid).toBe(false);
    });

    it("should require position or amount context", async () => {
      const message = {
        content: { text: "withdraw" },
      };

      const isValid = await withdrawAction.validate(mockRuntime, message);
      expect(isValid).toBe(false);
    });
  });

  describe("Handler - Request Step", () => {
    beforeEach(() => {
      mockLevvaService.getUserPositions.mockResolvedValue([
        {
          strategyId: 1,
          balance: 200,
          balanceUsd: 200,
          hasPendingWithdrawals: false,
        },
      ]);

      mockLevvaService.getStrategies.mockResolvedValue([
        {
          id: 1,
          name: "Safe Yield",
          category: "Vault",
          vault: {
            address: "0xVaultAddress",
            publicChainId: 1,
          },
        },
      ]);

      mockLevvaService.encodeRequestRedeem.mockReturnValue("0xEncodedData");
    });

    it("should handle withdrawal request successfully", async () => {
      const message = {
        content: { text: "withdraw 100 USDC from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal request");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();
      expect(mockLevvaService.getUserPositions).toHaveBeenCalled();
    });

    it("should reject withdrawal when insufficient balance", async () => {
      mockLevvaService.getUserPositions.mockResolvedValue([
        {
          strategyId: 1,
          balance: 50, // Less than requested 100
          balanceUsd: 50,
          hasPendingWithdrawals: false,
        },
      ]);

      const message = {
        content: { text: "withdraw 100 USDC from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal request");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("only have 50 available");
    });

    it("should reject withdrawal from non-existent position", async () => {
      mockLevvaService.getUserPositions.mockResolvedValue([]);

      const message = {
        content: { text: "withdraw 100 USDC from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal request");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("don't have any funds in Strategy 1");
    });

    it("should reject withdrawal from pool strategies", async () => {
      // Import and mock the API for this specific test
      const { getStrategies } = await import("../src/api/levva");
      vi.mocked(getStrategies).mockResolvedValueOnce({
        success: true,
        data: [
          {
            id: 1,
            name: "Pool Strategy",
            category: "Pool", // Pool category
            vault: null,
          },
        ],
      });

      const message = {
        content: { text: "withdraw 100 USDC from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal request");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("doesn't support withdrawals yet");
    });
  });

  describe("Handler - Check Step", () => {
    beforeEach(() => {
      mockRuntime.composeState.mockResolvedValue({
        data: {
          providers: {
            WITHDRAW_PARAMS: {
              data: {
                userAddress: "0x1234567890123456789012345678901234567890",
                withdrawalStep: "check",
              },
            },
          },
        },
      });
    });

    it("should show pending withdrawal requests", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([
        {
          requestId: 1,
          strategyId: 1,
          amount: 100,
          isFinalized: false,
          vaultAddress: "0xVault",
          withdrawalNftAddress: "0xNFT",
        },
      ]);

      const message = {
        content: { text: "check my withdrawal status" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal status check");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("Pending Requests");
      expect(callArgs).toContain("Request #1");
    });

    it("should show ready-to-claim requests", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([
        {
          requestId: 1,
          strategyId: 1,
          amount: 100,
          isFinalized: true, // Ready to claim
          vaultAddress: "0xVault",
          withdrawalNftAddress: "0xNFT",
        },
      ]);

      const message = {
        content: { text: "check my withdrawal status" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal status check");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("Ready to Claim");
      expect(callArgs).toContain("Request #1");
    });

    it("should handle no withdrawal requests", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([]);

      const message = {
        content: { text: "check my withdrawal status" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal status check");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("don't have any withdrawal requests");
    });
  });

  describe("Handler - Claim Step", () => {
    beforeEach(() => {
      mockRuntime.composeState.mockResolvedValue({
        data: {
          providers: {
            WITHDRAW_PARAMS: {
              data: {
                userAddress: "0x1234567890123456789012345678901234567890",
                withdrawalStep: "claim",
                requestId: 1,
              },
            },
          },
        },
      });

      mockLevvaService.encodeClaimWithdrawal.mockReturnValue("0xClaimData");
    });

    it("should handle withdrawal claim successfully", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([
        {
          requestId: 1,
          strategyId: 1,
          amount: 100,
          isFinalized: true,
          vaultAddress: "0xVault",
          withdrawalNftAddress: "0xNFT",
        },
      ]);

      const message = {
        content: { text: "claim withdrawal request #1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal claim");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();
      expect(mockLevvaService.encodeClaimWithdrawal).toHaveBeenCalledWith(
        1,
        "0x1234567890123456789012345678901234567890"
      );

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("Ready to claim your withdrawal");
    });

    it("should reject claim for non-finalized request", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([
        {
          requestId: 1,
          strategyId: 1,
          amount: 100,
          isFinalized: false, // Not ready
          vaultAddress: "0xVault",
          withdrawalNftAddress: "0xNFT",
        },
      ]);

      const message = {
        content: { text: "claim withdrawal request #1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal claim");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("not ready yet");
    });

    it("should reject claim for non-existent request", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([]);

      const message = {
        content: { text: "claim withdrawal request #1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal claim");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("not found");
    });
  });

  describe("Handler - Auto-Detection", () => {
    beforeEach(() => {
      mockRuntime.composeState.mockResolvedValue({
        data: {
          providers: {
            WITHDRAW_PARAMS: {
              data: {
                userAddress: "0x1234567890123456789012345678901234567890",
                // No specific step - should auto-detect
              },
            },
          },
        },
      });
    });

    it("should auto-detect and suggest claiming ready requests", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([
        {
          requestId: 1,
          strategyId: 1,
          amount: 100,
          isFinalized: true, // Ready to claim
          vaultAddress: "0xVault",
          withdrawalNftAddress: "0xNFT",
        },
      ]);

      const message = {
        content: { text: "help me with withdrawals" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal guidance");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("Ready to Claim");
    });

    it("should show guidance when no positions exist", async () => {
      mockLevvaService.getWithdrawalRequests.mockResolvedValue([]);
      mockLevvaService.getUserPositions.mockResolvedValue([]);

      const message = {
        content: { text: "help me with withdrawals" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal guidance");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("don't have any active positions");
    });
  });

  describe("Error Handling", () => {
    it("should handle missing Levva service", async () => {
      mockRuntime.getService.mockReturnValue(null);

      const message = {
        content: { text: "withdraw 100 USDC" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.text).toContain("Levva service unavailable");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("service is not available");
    });

    it("should handle missing withdraw parameters", async () => {
      mockRuntime.composeState.mockResolvedValue({
        data: {
          providers: {}, // No WITHDRAW_PARAMS
        },
      });

      const message = {
        content: { text: "withdraw" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.text).toContain("Missing withdrawal parameters");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("need more information");
    });

    it("should handle invalid user address", async () => {
      mockRuntime.composeState.mockResolvedValue({
        data: {
          providers: {
            WITHDRAW_PARAMS: {
              data: {
                userAddress: "invalid-address",
              },
            },
          },
        },
      });

      const message = {
        content: { text: "withdraw 100 USDC" },
        metadata: { userAddressId: "invalid-address" },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.text).toContain("Invalid wallet address");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain("valid wallet address");
    });

    it("should handle service errors gracefully", async () => {
      mockLevvaService.getUserPositions.mockRejectedValue(
        new Error("API Error")
      );

      const message = {
        content: { text: "withdraw 100 USDC from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const state = {};

      const result = await withdrawAction.handler(
        mockRuntime,
        message,
        state,
        {},
        mockCallback
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain("Generated withdrawal request");
      expect(result.data.actionName).toBe("WITHDRAW");
      expect(mockCallback).toHaveBeenCalled();

      const callArgs = mockCallback.mock.calls[0][0];
      expect(callArgs).toContain(
        "encountered an error while preparing your withdrawal request"
      );
    });
  });
});
