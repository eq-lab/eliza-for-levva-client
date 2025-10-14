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
        {
          // STEP 3: Select amount using suggestion
          message: "Deposit 50 USDC",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 3 VALIDATION:");
            expect(responses.length).toBeGreaterThan(0);

            // Should ask for confirmation or show transaction details
            const allText = responses
              .map((r) => r.text)
              .join(" ")
              .toLowerCase();

            console.log(
              `  ✅ Response mentions deposit: ${allText.includes("deposit")}`
            );

            // Should NOT ask for amount again
            expect(allText).not.toContain("how much");
          },
        },
        {
          // STEP 4: Cancel the deposit
          message: "cancel",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 4 VALIDATION (Cancel):");
            expect(responses.length).toBeGreaterThan(0);

            // Should acknowledge cancellation
            const allText = responses
              .map((r) => r.text)
              .join(" ")
              .toLowerCase();

            console.log(`  ✅ Response acknowledges cancel: ${allText.includes("cancel")}`);
            expect(allText).toMatch(/cancel/);
          },
        },
        {
          // STEP 5: Send unrelated message - EXPECTED: intent-unaware behavior
          // ACTUAL BUG: System creates a new deposit intent
          message: "What are my positions?",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 5 VALIDATION (Fallback to intent-unaware):");
            expect(responses.length).toBeGreaterThan(0);

            const allText = responses
              .map((r) => r.text)
              .join(" ")
              .toLowerCase();

            console.log(
              `  📊 Response contains position info: ${allText.includes("position") || allText.includes("portfolio")}`
            );

            // EXPECTED: Should show positions WITHOUT starting a new deposit intent
            // Should NOT ask for deposit parameters
            console.log(`  ❌ BUG CHECK - Response asks about deposit: ${allText.includes("how much") || allText.includes("which strategy")}`);
            
            expect(allText).not.toContain("how much");
            expect(allText).not.toContain("which strategy would you like");
            expect(allText).not.toContain("which token");
          },
        },
      ]);
    }, 150000); // 120 second timeout for multi-step flow with cancel
  });
});
