import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  runMultiStepFlow,
  type ChatTestContext,
} from "../chat/setup";

describe("Deposit Suggestions Integration", () => {
  let context: ChatTestContext;

  beforeAll(async () => {
    context = await setupChatTest();
  });

  afterAll(() => {
    teardownChatTest(context);
  });

  describe("Deposit Intent Flow", () => {
    it("should guide through deposit with progressive suggestions", async () => {
      // Cleanup first
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      let step1Suggestions: any[] = [];

      await runMultiStepFlow(context, [
        {
          // STEP 1: Initial deposit request
          message: "I want to deposit",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 1 VALIDATION:");
            expect(responses.length).toBeGreaterThan(0);

            // Save suggestions for next step
            step1Suggestions = suggestions;

            // Validate strategy selection suggestions
            const strategySuggestions = suggestions.filter(
              (s) =>
                s.text.toLowerCase().includes("deposit") &&
                s.text.toLowerCase().includes("strategy")
            );
            expect(strategySuggestions.length).toBeGreaterThan(0);

            // No "specify custom" suggestions
            const hasCustom = suggestions.some(
              (s) =>
                s.text.toLowerCase().includes("custom") ||
                s.text.toLowerCase().includes("specify")
            );
            expect(hasCustom).toBe(false);

            // User-facing language
            const hasAgentLanguage = suggestions.some(
              (s) =>
                s.text.toLowerCase().includes("consider") ||
                s.text.toLowerCase().includes("you could")
            );
            expect(hasAgentLanguage).toBe(false);
          },
        },
        {
          // STEP 2: Select strategy using first suggestion from step 1
          message:
            step1Suggestions[0]?.text ||
            "I want to deposit into the ultra-safe strategy",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 2 VALIDATION:");
            expect(responses.length).toBeGreaterThan(0);

            // For vault strategies, token is determined by vault - should show amounts directly
            // Validate amount suggestions with actual USDC amounts
            const amountSuggestions = suggestions.filter(
              (s) =>
                /\d+\.?\d*/.test(s.text) &&
                s.text.toLowerCase().includes("usdc")
            );
            expect(amountSuggestions.length).toBeGreaterThan(0);

            // Check actual amounts used in text, not percentages
            const hasPercentInText = suggestions.some((s) =>
              s.text.includes("%")
            );
            expect(hasPercentInText).toBe(false);

            // No "specify custom amount"
            const hasCustomAmount = suggestions.some((s) =>
              s.text.toLowerCase().includes("custom amount")
            );
            expect(hasCustomAmount).toBe(false);

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
