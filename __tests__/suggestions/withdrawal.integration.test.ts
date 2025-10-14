import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  runMultiStepFlow,
  ADDRESS,
  TEST_CONFIG,
  type ChatTestContext,
} from "../chat/setup";
import { getUserPositions, getWithdrawalRequests } from "../../src/api/levva";

describe("Withdrawal Suggestions Integration", () => {
  let context: ChatTestContext;

  beforeAll(async () => {
    context = await setupChatTest();
  });

  afterAll(() => {
    teardownChatTest(context);
  });

  describe("Current State Analysis", () => {
    it("should validate current chat messages and suggestions", async () => {
      console.log(
        "🔍 Analyzing current chat state (without clearing messages)..."
      );

      // Check current messages in the channel
      try {
        const result = await context.client.messaging.getChannelMessages(
          context.channelId,
          { limit: 10 }
        );

        const messages = result.messages;
        console.log(
          `💬 Found ${messages?.length || 0} recent messages in channel`
        );
        if (messages && messages.length > 0) {
          messages.slice(-5).forEach((msg, i) => {
            const sender = msg.senderId === context.userId ? "User" : "Agent";
            console.log(
              `  ${i + 1}. ${sender}: ${msg.text?.substring(0, 80)}${msg.text?.length > 80 ? "..." : ""}`
            );
          });
        }
      } catch (error) {
        console.log("⚠️  Could not fetch channel messages:", error.message);
      }

      // Check current suggestions cache using the correct API
      try {
        // Use the correct getSuggestions method with proper parameters
        const suggestionsResponse = await context.client.levva.getSuggestions(
          ADDRESS,
          context.channelId,
          TEST_CONFIG.chainId
        );

        const suggestions = suggestionsResponse.suggestions;

        if (suggestions && suggestions.length > 0) {
          console.log(
            `\n💡 Current cached suggestions (${suggestions.length}):`
          );
          suggestions.forEach((suggestion, i) => {
            console.log(
              `  ${i + 1}. "${suggestion.label}" - ${suggestion.text}`
            );
          });

          // Analyze current suggestion quality
          const withdrawalSuggestions = suggestions.filter(
            (s) =>
              s.text.toLowerCase().includes("withdraw") ||
              s.label.toLowerCase().includes("withdraw") ||
              s.text.toLowerCase().includes("claim") ||
              s.label.toLowerCase().includes("claim")
          );

          console.log(`\n📊 Current suggestion analysis:`);
          console.log(
            `   Withdrawal-related: ${withdrawalSuggestions.length}/${suggestions.length}`
          );
          console.log(`   Total suggestions: ${suggestions.length}`);

          if (withdrawalSuggestions.length === 0) {
            console.log(
              "❌ ISSUE: No withdrawal-related suggestions in current cache!"
            );
          }
        } else {
          console.log("\n💡 No current suggestions found in cache");
        }
      } catch (error) {
        console.log("⚠️  Suggestions API error:", error.message);
      }

      // Check user positions (this should work from API tests)
      console.log("\n🔍 Checking user positions from API...");
      try {
        const positionsResult = await getUserPositions(
          ADDRESS,
          TEST_CONFIG.chainId
        );
        if (positionsResult.success) {
          const positions = positionsResult.data;
          console.log(`📊 Found ${positions.length} positions:`);
          positions.forEach((pos: any, i: number) => {
            console.log(
              `  ${i + 1}. Strategy ${pos.strategyId}: ${pos.balance} tokens ($${pos.balanceUsd.toFixed(2)}) - ${pos.hasPendingWithdrawals ? "⏳ Has pending withdrawals" : "✅ Available"}`
            );
          });

          // Check withdrawal requests
          const withdrawalResult = await getWithdrawalRequests(
            ADDRESS,
            TEST_CONFIG.chainId
          );
          if (withdrawalResult.success) {
            const withdrawals = withdrawalResult.data;
            console.log(
              `\n🔄 Found ${withdrawals.length} withdrawal requests:`
            );
            withdrawals.forEach((req: any, i: number) => {
              console.log(
                `  ${i + 1}. Request #${req.requestId}: ${req.amount} tokens - ${req.isFinalized ? "✅ Ready to claim" : "⏳ Pending"}`
              );
            });

            // This gives us the context for what suggestions SHOULD be generated
            console.log(`\n🎯 Expected suggestions based on current state:`);
            if (withdrawals.some((req: any) => req.isFinalized)) {
              console.log("   - Should suggest claiming ready withdrawals");
            }
            if (withdrawals.some((req: any) => !req.isFinalized)) {
              console.log("   - Should suggest checking withdrawal status");
            }
            if (positions.length > 0) {
              console.log("   - Should suggest position management options");
              console.log(
                "   - Should suggest withdrawal from specific positions"
              );
            }
          }
        }
      } catch (error) {
        console.log("❌ Could not fetch positions via API:", error.message);
      }

      // This test is mainly for analysis, so we don't fail it
      expect(context.channelId).toBeDefined();
    });
  });

  describe("Withdrawal Request Flow", () => {
    it("should generate appropriate suggestions through multi-step flow", async () => {
      console.log(
        "\n📤 Testing multi-step withdrawal flow (cleaning up first)..."
      );

      // Cleanup intents and clear messages
      try {
        await context.client.levva.cleanupChannel(
          context.channelId,
          context.userId
        );
        await context.client.messaging.clearChannelHistory(context.channelId);
        console.log("✅ Cleaned up channel state");
      } catch (error) {
        console.log("⚠️  Could not clean up channel:", error.message);
      }

      // Define multi-step test flow
      await runMultiStepFlow(context, [
        {
          // STEP 1: Initial withdrawal request
          message: "I want to withdraw",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 1 VALIDATION:");

            // Check responses
            expect(responses.length).toBeGreaterThan(0);

            const withdrawalActions = responses.filter((r) =>
              r.actions?.some(
                (action: string) =>
                  action.includes("WITHDRAW") ||
                  action.includes("MANAGE_POSITIONS")
              )
            );

            console.log(
              `  ✅ Withdrawal-related responses: ${withdrawalActions.length}/${responses.length}`
            );

            // Analyze suggestions
            const withdrawalSuggestions = suggestions.filter(
              (s) =>
                s.text.toLowerCase().includes("withdraw") ||
                s.label.toLowerCase().includes("withdraw")
            );

            console.log(
              `  ✅ Withdrawal suggestions: ${withdrawalSuggestions.length}/${suggestions.length}`
            );

            // Check for position-specific suggestions
            const positionSuggestions = suggestions.filter(
              (s) =>
                s.text.toLowerCase().includes("strategy") ||
                s.text.toLowerCase().includes("position")
            );

            console.log(
              `  ✅ Position-specific: ${positionSuggestions.length}/${suggestions.length}`
            );

            // Validate we got withdrawal suggestions
            expect(withdrawalSuggestions.length).toBeGreaterThan(0);

            // Check that "Specify a custom amount" is NOT in suggestions
            const hasCustomAmountSuggestion = suggestions.some((s) =>
              s.text.toLowerCase().includes("custom amount")
            );
            if (hasCustomAmountSuggestion) {
              console.log(
                '  ❌ ISSUE: "Specify custom amount" suggestion found (should not be present)'
              );
            }
            expect(hasCustomAmountSuggestion).toBe(false);
          },
        },
        {
          // STEP 2: Select a position to withdraw from
          message: "Withdraw from Safe yield",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 2 VALIDATION:");

            // Check responses
            expect(responses.length).toBeGreaterThan(0);

            // Analyze amount suggestions
            const amountSuggestions = suggestions.filter((s) => {
              const text = s.text.toLowerCase();
              return (
                text.includes("withdraw") &&
                (text.includes("tokens") ||
                  text.includes("all") ||
                  /\d+\.?\d*/.test(text))
              );
            });

            console.log(
              `  ✅ Amount suggestions: ${amountSuggestions.length}/${suggestions.length}`
            );

            // Check that suggestions use actual amounts, not percentages in text
            const hasPercentageInText = suggestions.some(
              (s) =>
                s.text.includes("%") ||
                (s.text.includes("50%") && s.label.includes("Withdraw"))
            );

            if (hasPercentageInText) {
              console.log(
                "  ⚠️  WARNING: Some suggestions use percentages in text (prefer actual amounts)"
              );
            }

            // Log examples of amount suggestions
            console.log("  📋 Amount suggestion examples:");
            amountSuggestions.slice(0, 3).forEach((s) => {
              console.log(`     - "${s.label}": "${s.text}"`);
            });

            // Validate we got amount suggestions
            expect(amountSuggestions.length).toBeGreaterThan(0);

            // Check that "Specify a custom amount" is NOT in suggestions
            const hasCustomAmountSuggestion = suggestions.some((s) =>
              s.text.toLowerCase().includes("custom amount")
            );
            if (hasCustomAmountSuggestion) {
              console.log(
                '  ❌ ISSUE: "Specify custom amount" suggestion found (should not be present)'
              );
            }
            expect(hasCustomAmountSuggestion).toBe(false);
          },
        },
        {
          // STEP 3: Specify amount for withdrawal
          message: "Withdraw 2 USDC",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 3 VALIDATION:");

            // Check responses
            expect(responses.length).toBeGreaterThan(0);

            // Should ask for confirmation or show transaction details
            const allText = responses
              .map((r) => r.text)
              .join(" ")
              .toLowerCase();

            console.log(
              `  ✅ Response mentions withdrawal: ${allText.includes("withdraw")}`
            );

            // Should NOT ask for amount again
            expect(allText).not.toContain("how much");
          },
        },
        {
          // STEP 4: Cancel the withdrawal
          message: "cancel withdrawal",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 4 VALIDATION (Cancel):");

            // Check responses
            expect(responses.length).toBeGreaterThan(0);

            // Should acknowledge cancellation
            const allText = responses
              .map((r) => r.text)
              .join(" ")
              .toLowerCase();

            console.log(
              `  ✅ Response acknowledges cancel: ${allText.includes("cancel")}`
            );
            expect(allText).toMatch(/cancel/);
          },
        },
        {
          // STEP 5: Send unrelated message - EXPECTED: intent-unaware behavior
          // ACTUAL BUG: System creates a new withdrawal intent
          message: "Show my positions",
          validate: (responses, suggestions) => {
            console.log("\n🎯 STEP 5 VALIDATION (Fallback to intent-unaware):");

            // Check responses
            expect(responses.length).toBeGreaterThan(0);

            const allText = responses
              .map((r) => r.text)
              .join(" ")
              .toLowerCase();

            console.log(
              `  📊 Response contains portfolio info: ${allText.includes("portfolio") || allText.includes("value")}`
            );

            // EXPECTED: Should show portfolio value WITHOUT starting a new withdrawal intent
            // Should NOT ask for withdrawal parameters
            console.log(
              `  ❌ BUG CHECK - Response asks about withdrawal: ${allText.includes("which position") || allText.includes("withdraw from")}`
            );

            expect(allText).not.toContain("which position");
            expect(allText).not.toContain("withdraw from");
            expect(allText).not.toContain(
              "how much would you like to withdraw"
            );
          },
        },
      ]);
    }, 150000); // 120 second timeout for multi-step flow with cancel
  });

  describe("Suggestion System Debugging", () => {
    it("should verify suggestion evaluator is running", async () => {
      console.log("\n🔍 Debugging suggestion system...");

      // Check if the agent is running and responding
      const agents = await context.client.agents.listAgents();
      console.log(`🤖 Available agents: ${agents.agents?.length || 0}`);

      if (agents.agents && agents.agents.length > 0) {
        const agent = agents.agents[0];
        console.log(`   Agent ID: ${agent.id}`);
        console.log(`   Agent Name: ${agent.name || "Unknown"}`);
      }

      // Verify user context is available
      console.log(`👤 User ID from context: ${context.userId}`);

      // This test is mainly for debugging, so we don't fail it
      expect(agents.agents).toBeDefined();
    });
  });
});
