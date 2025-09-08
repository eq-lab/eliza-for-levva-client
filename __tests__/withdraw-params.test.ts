import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  withdrawParamsProvider,
  WITHDRAW_PARAMS_PROVIDER_NAME,
} from "../src/providers/withdraw-params";
import { createMockRuntime } from "./utils/core-test-utils";

describe("Withdraw Params Provider", () => {
  let mockRuntime: any;
  let mockCacheManager: any;

  beforeEach(() => {
    mockRuntime = createMockRuntime();

    // Mock cache manager (legacy - should not be used)
    mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
    };
    mockRuntime.cacheManager = mockCacheManager;

    // Mock proper cache methods
    mockRuntime.getCache = vi.fn().mockResolvedValue(undefined);
    mockRuntime.setCache = vi.fn().mockResolvedValue(true);

    // Mock logger
    mockRuntime.logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Mock useModel for LLM calls
    mockRuntime.useModel = vi.fn();
    mockRuntime.character = {
      modelProvider: "openai",
    };
  });

  describe("LLM-based Parameter Extraction", () => {
    it("should extract withdrawal parameters using LLM", async () => {
      const mockLLMResponse = JSON.stringify({
        strategyId: 2,
        amount: 150.5,
        withdrawalStep: "request",
        requestId: null,
        confidence: 95,
      });

      mockRuntime.useModel.mockResolvedValue(mockLLMResponse);
      mockRuntime.getCache.mockResolvedValue(null); // No cache hit

      const message = {
        id: "test-message-123",
        content: { text: "I want to withdraw 150.5 USDC from strategy 2" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(mockRuntime.useModel).toHaveBeenCalledWith(
        "OBJECT_SMALL", // ModelType.OBJECT_SMALL
        expect.stringContaining(
          "Extract withdrawal parameters from user message"
        )
      );

      expect(mockRuntime.setCache).toHaveBeenCalledWith(
        "withdraw-params-test-message-123",
        expect.objectContaining({
          strategyId: 2,
          amount: 150.5,
          withdrawalStep: "request",
          confidence: 95,
        })
      );

      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
          strategyId: 2,
          amount: 150.5,
          withdrawalStep: "request",
        },
      });
    });

    it("should handle 'all' amount extraction", async () => {
      const mockLLMResponse = JSON.stringify({
        strategyId: 1,
        amount: "all",
        withdrawalStep: "request",
        requestId: null,
        confidence: 90,
      });

      mockRuntime.useModel.mockResolvedValue(mockLLMResponse);
      mockRuntime.getCache.mockResolvedValue(null);

      const message = {
        id: "test-message-456",
        content: { text: "withdraw all my funds from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
          strategyId: 1,
          amount: -1, // Special value for "all"
          withdrawalStep: "request",
        },
      });
    });

    it("should extract claim parameters with request ID", async () => {
      const mockLLMResponse = JSON.stringify({
        strategyId: null,
        amount: null,
        withdrawalStep: "claim",
        requestId: 123,
        confidence: 85,
      });

      mockRuntime.useModel.mockResolvedValue(mockLLMResponse);
      mockRuntime.getCache.mockResolvedValue(null);

      const message = {
        id: "test-message-789",
        content: { text: "claim withdrawal request #123" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
          withdrawalStep: "claim",
          requestId: 123,
        },
      });
    });

    it("should extract check status parameters", async () => {
      const mockLLMResponse = JSON.stringify({
        strategyId: null,
        amount: null,
        withdrawalStep: "check",
        requestId: null,
        confidence: 80,
      });

      mockRuntime.useModel.mockResolvedValue(mockLLMResponse);
      mockRuntime.getCache.mockResolvedValue(null);

      const message = {
        id: "test-message-status",
        content: { text: "check my withdrawal status" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
          withdrawalStep: "check",
        },
      });
    });
  });

  describe("Caching Behavior", () => {
    it("should use cached results to prevent redundant LLM calls", async () => {
      const cachedParams = {
        strategyId: 3,
        amount: 200,
        withdrawalStep: "request" as const,
        requestId: null,
        confidence: 92,
      };

      mockRuntime.getCache.mockResolvedValue(cachedParams);

      const message = {
        id: "cached-message-123",
        content: { text: "withdraw 200 from strategy 3" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(mockRuntime.getCache).toHaveBeenCalledWith(
        "withdraw-params-cached-message-123"
      );
      expect(mockRuntime.useModel).not.toHaveBeenCalled(); // Should not call LLM
      expect(mockRuntime.setCache).not.toHaveBeenCalled(); // Should not update cache

      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
          strategyId: 3,
          amount: 200,
          withdrawalStep: "request",
        },
      });
    });

    it("should use correct cache key format", async () => {
      mockRuntime.getCache.mockResolvedValue(null);
      mockRuntime.useModel.mockResolvedValue('{"confidence": 50}');

      const message = {
        id: "unique-message-id-789",
        content: { text: "some withdrawal request" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      await withdrawParamsProvider.get(mockRuntime, message);

      expect(mockRuntime.getCache).toHaveBeenCalledWith(
        "withdraw-params-unique-message-id-789"
      );
      expect(mockRuntime.setCache).toHaveBeenCalledWith(
        "withdraw-params-unique-message-id-789",
        expect.any(Object)
      );
    });
  });

  describe("Fallback Behavior", () => {
    it("should fallback to regex extraction when LLM fails", async () => {
      mockRuntime.useModel.mockRejectedValue(new Error("LLM API Error"));
      mockRuntime.getCache.mockResolvedValue(null);

      const message = {
        id: "fallback-test",
        content: { text: "withdraw 50 USDC from strategy 1" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(mockRuntime.logger.error).toHaveBeenCalledWith(
        "Error extracting withdraw params with LLM:",
        expect.any(Error)
      );

      expect(mockRuntime.setCache).toHaveBeenCalledWith(
        "withdraw-params-fallback-test",
        expect.objectContaining({
          strategyId: 1,
          amount: 50,
          withdrawalStep: "request",
          confidence: 50, // Lower confidence for regex fallback
        })
      );

      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
          strategyId: 1,
          amount: 50,
          withdrawalStep: "request",
        },
      });
    });

    it("should handle malformed LLM response gracefully", async () => {
      mockRuntime.useModel.mockResolvedValue("Invalid JSON response");
      mockRuntime.getCache.mockResolvedValue(null);

      const message = {
        id: "malformed-test",
        content: { text: "withdraw everything from position 2" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        "Failed to parse LLM response for withdraw params"
      );

      // Should still return basic params with user address
      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
        },
      });
    });
  });

  describe("Validation and Edge Cases", () => {
    it("should return null for invalid user address", async () => {
      const message = {
        id: "invalid-address",
        content: { text: "withdraw 100 USDC" },
        metadata: { userAddressId: "invalid-address" },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(result).toEqual({
        text: "Invalid or missing user address for withdrawal",
        data: {},
      });
      expect(mockRuntime.useModel).not.toHaveBeenCalled();
    });

    it("should return null when no user address provided", async () => {
      const message = {
        id: "no-address",
        content: { text: "withdraw 100 USDC" },
        metadata: {},
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      expect(result).toEqual({
        text: "Invalid or missing user address for withdrawal",
        data: {},
      });
      expect(mockRuntime.useModel).not.toHaveBeenCalled();
    });

    it("should validate extracted parameters", async () => {
      const mockLLMResponse = JSON.stringify({
        strategyId: -1, // Invalid strategy ID
        amount: -50, // Invalid amount
        withdrawalStep: "request",
        requestId: -10, // Invalid request ID
        confidence: 70,
      });

      mockRuntime.useModel.mockResolvedValue(mockLLMResponse);
      mockRuntime.getCache.mockResolvedValue(null);

      const message = {
        id: "validation-test",
        content: { text: "some invalid request" },
        metadata: {
          userAddressId: "0x1234567890123456789012345678901234567890",
        },
      };

      const result = await withdrawParamsProvider.get(mockRuntime, message);

      // Should filter out invalid parameters
      expect(result).toEqual({
        text: expect.stringContaining("Extracted withdrawal parameters"),
        data: {
          userAddress: "0x1234567890123456789012345678901234567890",
          withdrawalStep: "request", // Only valid parameter should remain
        },
      });
    });
  });

  describe("Provider Configuration", () => {
    it("should have correct provider name", () => {
      expect(WITHDRAW_PARAMS_PROVIDER_NAME).toBe("WITHDRAW_PARAMS");
    });

    it("should be a valid provider object", () => {
      expect(withdrawParamsProvider).toHaveProperty("get");
      expect(typeof withdrawParamsProvider.get).toBe("function");
    });
  });
});
