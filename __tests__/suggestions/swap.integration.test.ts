import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  runMultiStepFlow,
  type ChatTestContext,
} from "../chat/setup";

describe("Swap Suggestions Integration", () => {
  let context: ChatTestContext;

  beforeAll(async () => {
    context = await setupChatTest();
  });

  afterAll(() => {
    teardownChatTest(context);
  });

  describe("Swap Intent Flow", () => {
    it("should guide through swap with progressive suggestions", async () => {
      // Cleanup first
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      await runMultiStepFlow(context, [
        {
          // STEP 1: Initial swap request
          message: "I want to swap",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 1 VALIDATION:");
            expect(responses.length).toBeGreaterThan(0);

            // Validate token pair suggestions
            const pairSuggestions = suggestions.filter(
              (s) =>
                s.text.toLowerCase().includes("swap") &&
                (s.text.includes("to") || s.text.includes("for"))
            );
            expect(pairSuggestions.length).toBeGreaterThan(0);

            // No agent language
            const hasAgentLanguage = suggestions.some(
              (s) =>
                s.text.toLowerCase().includes("consider") ||
                s.text.toLowerCase().includes("you could")
            );
            expect(hasAgentLanguage).toBe(false);
          },
        },
        {
          // STEP 2: Select token pair
          message: "Swap USDC to WETH",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 2 VALIDATION:");
            expect(responses.length).toBeGreaterThan(0);

            // Validate amount suggestions
            const amountSuggestions = suggestions.filter(
              (s) =>
                /\d+\.?\d*/.test(s.text) &&
                s.text.toLowerCase().includes("usdc")
            );
            expect(amountSuggestions.length).toBeGreaterThan(0);

            // No "specify custom amount"
            const hasCustomAmount = suggestions.some((s) =>
              s.text.toLowerCase().includes("custom amount")
            );
            expect(hasCustomAmount).toBe(false);

            // Check actual amounts, not percentages in text
            const hasPercentInText = suggestions.some((s) =>
              s.text.includes("%")
            );
            expect(hasPercentInText).toBe(false);

            // User-facing language
            const hasAgentLanguage = suggestions.some(
              (s) =>
                s.text.toLowerCase().includes("consider") ||
                s.text.toLowerCase().includes("you could")
            );
            expect(hasAgentLanguage).toBe(false);
          },
        },
      ]);
    }, 90000);
  });
});
