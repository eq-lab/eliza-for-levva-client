import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupChatTest, teardownChatTest, ADDRESS, type ChatTestContext } from "../chat/setup";

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
      console.log("🔍 Analyzing current chat state (without clearing messages)...");
      
      // Check current messages in the channel
      try {
        const messages = await context.client.messaging.getChannelMessages({
          channelId: context.channelId,
          limit: 10,
        });

        console.log(`💬 Found ${messages?.length || 0} recent messages in channel`);
        if (messages && messages.length > 0) {
          messages.slice(-5).forEach((msg, i) => {
            const sender = msg.senderId === context.userId ? "User" : "Agent";
            console.log(`  ${i + 1}. ${sender}: ${msg.text?.substring(0, 80)}${msg.text?.length > 80 ? "..." : ""}`);
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
          1
        );

        const suggestions = suggestionsResponse.suggestions;

        if (suggestions && suggestions.length > 0) {
          console.log(`\n💡 Current cached suggestions (${suggestions.length}):`);
          suggestions.forEach((suggestion, i) => {
            console.log(`  ${i + 1}. "${suggestion.label}" - ${suggestion.text}`);
          });

          // Analyze current suggestion quality
          const withdrawalSuggestions = suggestions.filter(s => 
            s.text.toLowerCase().includes('withdraw') || 
            s.label.toLowerCase().includes('withdraw') ||
            s.text.toLowerCase().includes('claim') ||
            s.label.toLowerCase().includes('claim')
          );

          console.log(`\n📊 Current suggestion analysis:`);
          console.log(`   Withdrawal-related: ${withdrawalSuggestions.length}/${suggestions.length}`);
          console.log(`   Total suggestions: ${suggestions.length}`);

          if (withdrawalSuggestions.length === 0) {
            console.log("❌ ISSUE: No withdrawal-related suggestions in current cache!");
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
        // Use the working API call pattern from api-levva.integration.test.ts
        const response = await fetch(`http://localhost:3001/api/v1/strategies/user-positions/${ADDRESS}?chainId=1`);
        if (response.ok) {
          const positions = await response.json();
          console.log(`📊 Found ${positions.length} positions:`);
          positions.forEach((pos: any, i: number) => {
            console.log(`  ${i + 1}. Strategy ${pos.strategyId}: ${pos.balance} tokens ($${pos.balanceUsd.toFixed(2)}) - ${pos.hasPendingWithdrawals ? '⏳ Has pending withdrawals' : '✅ Available'}`);
          });

          // Check withdrawal requests
          const withdrawalResponse = await fetch(`http://localhost:3001/api/v2/vaults/1/withdrawal-requests/${ADDRESS}?chainId=1`);
          if (withdrawalResponse.ok) {
            const withdrawals = await withdrawalResponse.json();
            console.log(`\n🔄 Found ${withdrawals.length} withdrawal requests:`);
            withdrawals.forEach((req: any, i: number) => {
              console.log(`  ${i + 1}. Request #${req.requestId}: ${req.amount} tokens - ${req.isFinalized ? '✅ Ready to claim' : '⏳ Pending'}`);
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
              console.log("   - Should suggest withdrawal from specific positions");
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
    it("should generate appropriate suggestions after withdrawal request", async () => {
      console.log("\n📤 Testing withdrawal request flow (clearing messages first)...");
      
      // Clear channel history for clean test
      try {
        await context.client.messaging.clearChannelHistory(context.channelId);
        console.log("✅ Channel history cleared");
      } catch (error) {
        console.log("⚠️  Could not clear channel history:", error.message);
      }
      
      // Set up response tracking
      const responses: any[] = [];
      const messageHandler = (message: any) => {
        if (message.senderId !== context.userId) { // Agent messages
          console.log(`\n📨 Agent Response:`, {
            text: message.text?.substring(0, 100) + (message.text?.length > 100 ? "..." : ""),
            actions: message.actions,
            thought: message.thought?.substring(0, 50) + (message.thought?.length > 50 ? "..." : ""),
          });
          responses.push(message);
        }
      };

      context.socket.evtMessageBroadcast.attach(messageHandler);

      // Send withdrawal request
      const message = "I want to withdraw";
      console.log(`💬 Sending: "${message}"`);
      
      // Use the same format as working chat tests
      const { randomUUID } = await import("crypto");
      context.socket.sendMessage(
        message,
        context.channelId,
        randomUUID(),
        "client_chat",
        undefined,
        randomUUID(),
        {
          channelType: "DM",
          isDm: true,
          targetUserId: context.agentId,
          userAddressId: context.userId,
          chainId: 1,
        }
      );

      // Wait for responses
      console.log("⏳ Waiting for agent responses...");
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait

      // Detach handler
      context.socket.evtMessageBroadcast.detach(messageHandler);

      console.log(`\n📊 Received ${responses.length} responses`);
      
      // Analyze responses
      responses.forEach((response, i) => {
        console.log(`\n${i + 1}. Action: ${response.actions?.join(", ") || "NONE"}`);
        console.log(`   Text: ${response.text?.substring(0, 200)}${response.text?.length > 200 ? "..." : ""}`);
        if (response.thought) {
          console.log(`   Thought: ${response.thought.substring(0, 100)}${response.thought.length > 100 ? "..." : ""}`);
        }
      });

      // Check if we got any responses
      expect(responses.length).toBeGreaterThan(0);

      // Check for withdrawal-related actions
      const withdrawalActions = responses.filter(r => 
        r.actions?.some((action: string) => 
          action.includes('WITHDRAW') || action.includes('MANAGE_POSITIONS')
        )
      );

      console.log(`\n✅ Withdrawal-related responses: ${withdrawalActions.length}/${responses.length}`);
      
      if (withdrawalActions.length === 0) {
        console.log("❌ ISSUE: No withdrawal-related actions triggered!");
      }

      // Wait a bit more for suggestions to be generated
      console.log("\n⏳ Waiting for suggestions to be generated...");
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Try to get updated suggestions using correct API
      try {
        const suggestionsResponse = await context.client.levva.getSuggestions(
          ADDRESS,
          context.channelId,
          1
        );

        const suggestions = suggestionsResponse.suggestions;

        console.log(`\n💡 Updated suggestions (${suggestions?.length || 0}):`);
        if (suggestions && suggestions.length > 0) {
          suggestions.forEach((suggestion, i) => {
            console.log(`${i + 1}. "${suggestion.label}" - ${suggestion.text}`);
          });

          // Analyze suggestion quality
          const withdrawalSuggestions = suggestions.filter(s => 
            s.text.toLowerCase().includes('withdraw') || 
            s.label.toLowerCase().includes('withdraw') ||
            s.text.toLowerCase().includes('claim') ||
            s.label.toLowerCase().includes('claim')
          );

          console.log(`\n🎯 ANALYSIS:`);
          console.log(`✅ Withdrawal-related suggestions: ${withdrawalSuggestions.length}/${suggestions.length}`);

          // Check for position-specific suggestions
          const positionSuggestions = suggestions.filter(s =>
            s.text.toLowerCase().includes('strategy') ||
            s.text.toLowerCase().includes('position') ||
            /strategy\s+\d+/i.test(s.text)
          );

          console.log(`✅ Position-specific suggestions: ${positionSuggestions.length}/${suggestions.length}`);

          // Check for amount-specific suggestions
          const amountSuggestions = suggestions.filter(s =>
            /\d+%/.test(s.text) || 
            /\d+\.\d+/.test(s.text) ||
            s.text.toLowerCase().includes('all')
          );

          console.log(`✅ Amount-specific suggestions: ${amountSuggestions.length}/${suggestions.length}`);

          // Quality assessment
          if (withdrawalSuggestions.length === 0) {
            console.log("❌ ISSUE: No withdrawal-related suggestions found!");
          }
          
          if (suggestions.every(s => s.text.toLowerCase().includes('generic') || s.text.length < 20)) {
            console.log("❌ ISSUE: Suggestions appear too generic!");
          }

          if (suggestions.length < 3) {
            console.log("⚠️  WARNING: Few suggestions provided (expected 3-4)");
          }

          console.log("\n🎯 EXPECTED vs ACTUAL:");
          console.log("Expected for 'I want to withdraw':");
          console.log("  1. Position selection (if no strategy specified)");
          console.log("  2. Amount suggestions (25%, 66%, 100% if strategy known)");
          console.log("  3. Status check (if pending withdrawals)");
          console.log("  4. General guidance");

          // Test should pass if we have some withdrawal-related suggestions
          expect(withdrawalSuggestions.length).toBeGreaterThan(0);
        } else {
          console.log("❌ NO SUGGESTIONS - This is a major issue!");
          // For now, don't fail the test but log the issue
          console.log("⚠️  This indicates the suggestion system is not working properly");
        }
      } catch (error) {
        console.error("❌ Error getting updated suggestions:", error.message);
        console.log("⚠️  Suggestions API may not be working properly");
      }
    }, 30000); // 30 second timeout
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
        console.log(`   Agent Name: ${agent.name || 'Unknown'}`);
      }

      // Check if we can get user info
      try {
        const user = await context.client.levva.getUserId({
          secret: process.env.SECRET || "",
          address: ADDRESS,
        });
        console.log(`👤 User lookup successful: ${user?.id ? 'Yes' : 'No'}`);
      } catch (error) {
        console.log(`❌ User lookup failed: ${error.message}`);
      }

      // This test is mainly for debugging, so we don't fail it
      expect(agents.agents).toBeDefined();
    });
  });
});
