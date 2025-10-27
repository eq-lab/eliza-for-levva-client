import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  runMultiStepFlow,
  sendMessageAndWaitForComplete,
  TEST_CONFIG,
  type ChatTestContext,
} from "../chat/setup";

const ADDRESS = TEST_CONFIG.address;

describe("Send Suggestions Integration", () => {
  let context: ChatTestContext;

  beforeAll(async () => {
    context = await setupChatTest();
  });

  afterAll(() => {
    teardownChatTest(context);
  });

  describe("Send Intent Flow", () => {
    it("should guide through send with progressive suggestions", async () => {
      // Cleanup first
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      await runMultiStepFlow(context, [
        {
          // STEP 1: Initial send request
          message: "I want to send tokens",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 1 VALIDATION:");
            expect(responses.length).toBeGreaterThan(0);

            // Validate token selection suggestions
            const tokenSuggestions = suggestions.filter(
              (s) =>
                s.text.toLowerCase().includes("send") &&
                (s.text.includes("USDC") ||
                  s.text.includes("ETH") ||
                  s.text.includes("WETH"))
            );
            expect(tokenSuggestions.length).toBeGreaterThan(0);

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
          // STEP 2: Select token
          message: "Send USDC",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 2 VALIDATION:");
            expect(responses.length).toBeGreaterThan(0);

            // Should ask for amount or address
            // Check we have meaningful suggestions
            expect(suggestions.length).toBeGreaterThan(0);

            const hasAmountOrAddress = suggestions.some((s) => {
              const text = s.text.toLowerCase();
              return (
                /\d+\.?\d*/.test(s.text) ||
                text.includes("address") ||
                text.includes("to")
              );
            });
            expect(hasAmountOrAddress).toBe(true);

            // No custom amount suggestions
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

    it("should NOT trigger SEND intent for general portfolio analysis", async () => {
      // Cleanup first to ensure no stale intents
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      // Send a portfolio analysis request
      const responses = await sendMessageAndWaitForComplete(
        context,
        "Analyze my portfolio"
      );

      console.log("\n📊 PORTFOLIO ANALYSIS TEST:");
      console.log(`📊 Received ${responses.length} responses`);
      responses.forEach((r, i) => {
        console.log(
          `\n  ${i + 1}. Action: ${r.rawMessage?.actions?.[0] || "NONE"}`
        );
        console.log(
          `     Text: ${r.text?.substring(0, 100)}${r.text && r.text.length > 100 ? "..." : ""}`
        );
      });

      // Wait for suggestions to be generated
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const suggestionsResponse = await context.client.levva.getSuggestions(
        ADDRESS,
        context.channelId,
        TEST_CONFIG.chainId
      );

      const suggestions = suggestionsResponse.suggestions;

      console.log(`\n💡 Suggestions (${suggestions.length}):`);
      suggestions.forEach((s, i) => {
        console.log(`  ${i + 1}. "${s.label}" - ${s.text}`);
      });

      // CRITICAL: Suggestions should NOT be SEND-related
      const hasSendSuggestions = suggestions.some(
        (s) =>
          s.text.toLowerCase().includes("send") ||
          s.text.toLowerCase().includes("transfer") ||
          s.label.toLowerCase().includes("send")
      );

      console.log(`\n🔍 Has SEND suggestions: ${hasSendSuggestions}`);
      expect(hasSendSuggestions).toBe(false);

      // Should have portfolio/analysis related suggestions instead
      const hasPortfolioSuggestions = suggestions.some(
        (s) =>
          s.text.toLowerCase().includes("position") ||
          s.text.toLowerCase().includes("strategy") ||
          s.text.toLowerCase().includes("deposit") ||
          s.text.toLowerCase().includes("withdraw") ||
          s.text.toLowerCase().includes("portfolio")
      );

      console.log(
        `\n✅ Has portfolio-related suggestions: ${hasPortfolioSuggestions}`
      );
      expect(hasPortfolioSuggestions).toBe(true);
    }, 60000);
  });
});
