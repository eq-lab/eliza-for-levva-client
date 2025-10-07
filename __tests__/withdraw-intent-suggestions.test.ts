import { describe, it, expect } from "vitest";
import { generateWithdrawIntentSuggestionsPrompt } from "../src/prompts/suggest/withdraw-intent";
import { INTENT_TYPE, LEVVA_ACTIONS } from "../src/constants/enum";

describe("Withdraw Intent Suggestions", () => {
  const mockIntentContext = {
    id: "test-intent-1",
    type: INTENT_TYPE.WITHDRAW,
    domain: LEVVA_ACTIONS.MANAGE_POSITIONS,
    createdAt: Date.now(),
    userId: "test-user",
    channelId: "test-channel",
    status: "ACTIVE" as const,
  };

  const mockPositions = [
    { strategyId: 1, balance: 1000, balanceUsd: 1500 },
    { strategyId: 2, balance: 500, balanceUsd: 750 },
    { strategyId: 3, balance: 100, balanceUsd: 150 },
  ];

  const mockStrategies = [
    { id: 1, name: "Ultra-Safe Strategy", risk: "ultra-safe" },
    { id: 2, name: "Safe Strategy", risk: "safe" },
    { id: 3, name: "Brave Strategy", risk: "brave" },
  ];

  it("should generate position selection suggestions when no strategy selected", () => {
    const prompt = generateWithdrawIntentSuggestionsPrompt({
      intentContext: mockIntentContext,
      conversation: "User: I want to withdraw",
      userAddress: "0x1234567890123456789012345678901234567890",
      chainId: 8453,
      returnData: {},
      positions: mockPositions,
      strategies: mockStrategies,
      withdrawalRequests: [],
    });

    expect(prompt).toContain("position selection suggestions");
    expect(prompt).toContain("Ultra-Safe Strategy");
    expect(prompt).toContain("Safe Strategy");
    expect(prompt).toContain("Brave Strategy");
    expect(prompt).toContain("1000 tokens");
    expect(prompt).toContain("$1500");
  });

  it("should generate amount suggestions when strategy selected but no amount", () => {
    const prompt = generateWithdrawIntentSuggestionsPrompt({
      intentContext: mockIntentContext,
      conversation: "User: I want to withdraw from ultra-safe strategy",
      userAddress: "0x1234567890123456789012345678901234567890",
      chainId: 8453,
      returnData: {
        strategyId: 1,
        strategyName: "Ultra-Safe Strategy",
      },
      positions: mockPositions,
      strategies: mockStrategies,
      withdrawalRequests: [],
    });

    expect(prompt).toContain("amount-based withdrawal suggestions");
    expect(prompt).toContain("Ultra-Safe Strategy");
    expect(prompt).toContain("25%");
    expect(prompt).toContain("66%");
    expect(prompt).toContain("100%");
    // Check for calculated amounts
    expect(prompt).toContain("250.000000"); // 25% of 1000
    expect(prompt).toContain("660.000000"); // 66% of 1000
    expect(prompt).toContain("1000.000000"); // 100% of 1000
  });

  it("should generate confirmation suggestions when all parameters provided", () => {
    const prompt = generateWithdrawIntentSuggestionsPrompt({
      intentContext: mockIntentContext,
      conversation:
        "User: I want to withdraw 500 from ultra-safe strategy\\nAgent: Confirm?",
      userAddress: "0x1234567890123456789012345678901234567890",
      chainId: 8453,
      returnData: {
        strategyId: 1,
        strategyName: "Ultra-Safe Strategy",
        amount: 500,
      },
      positions: mockPositions,
      strategies: mockStrategies,
      withdrawalRequests: [],
    });

    expect(prompt).toContain("confirmation and modification suggestions");
    expect(prompt).toContain("Ultra-Safe Strategy");
    expect(prompt).toContain("Amount: 500");
    expect(prompt).toContain("Ready for confirmation");
  });

  it("should handle pending withdrawals in position selection", () => {
    const prompt = generateWithdrawIntentSuggestionsPrompt({
      intentContext: mockIntentContext,
      conversation: "User: I want to withdraw",
      userAddress: "0x1234567890123456789012345678901234567890",
      chainId: 8453,
      returnData: {},
      positions: mockPositions,
      strategies: mockStrategies,
      withdrawalRequests: [{ strategyId: 1, status: "PENDING" }],
    });

    expect(prompt).toContain("User has 1 pending withdrawal(s)");
    expect(prompt).toContain("Check withdrawal status");
    expect(prompt).toContain("[Has pending withdrawal]");
  });

  it("should generate empty suggestions when no positions available", () => {
    const prompt = generateWithdrawIntentSuggestionsPrompt({
      intentContext: mockIntentContext,
      conversation: "User: I want to withdraw",
      userAddress: "0x1234567890123456789012345678901234567890",
      chainId: 8453,
      returnData: {},
      positions: [],
      strategies: mockStrategies,
      withdrawalRequests: [],
    });

    expect(prompt).toContain("empty suggestions");
    expect(prompt).toContain("no positions to withdraw from");
  });

  it("should handle position not found edge case", () => {
    const prompt = generateWithdrawIntentSuggestionsPrompt({
      intentContext: mockIntentContext,
      conversation: "User: I want to withdraw from strategy 99",
      userAddress: "0x1234567890123456789012345678901234567890",
      chainId: 8453,
      returnData: {
        strategyId: 99, // Non-existent strategy
      },
      positions: mockPositions,
      strategies: mockStrategies,
      withdrawalRequests: [],
    });

    expect(prompt).toContain("fallback suggestions");
    expect(prompt).toContain("selected strategy not found");
    expect(prompt).toContain("Check positions");
  });

  it("should handle all amount type", () => {
    const prompt = generateWithdrawIntentSuggestionsPrompt({
      intentContext: mockIntentContext,
      conversation: "User: I want to withdraw all from ultra-safe strategy",
      userAddress: "0x1234567890123456789012345678901234567890",
      chainId: 8453,
      returnData: {
        strategyId: 1,
        strategyName: "Ultra-Safe Strategy",
        amount: "all",
      },
      positions: mockPositions,
      strategies: mockStrategies,
      withdrawalRequests: [],
    });

    expect(prompt).toContain("confirmation and modification suggestions");
    expect(prompt).toContain("Amount: ALL");
  });
});


