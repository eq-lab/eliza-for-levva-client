import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import {
  setupChatTest,
  teardownChatTest,
  type ChatTestContext,
  TEST_CONFIG,
} from "./setup";

describe("Response Quality Integration Tests", () => {
  let context: ChatTestContext | undefined;

  beforeAll(async () => {
    try {
      context = await setupChatTest();
    } catch (error) {
      console.error("Failed to setup chat test:", error);
      throw error;
    }
  });

  afterAll(async () => {
    teardownChatTest(context);
  });

  describe("Position Response Quality", () => {
    it("should not duplicate position information in MANAGE_POSITIONS responses", async () => {
      if (!context) throw new Error("Test context not initialized");

      const { client, socket, userId, agentId, channelId } = context;

      // Clear channel to start fresh
      await client.messaging.clearChannelHistory(channelId);

      // Send position request using the working pattern
      socket.sendMessage(
        "Show me my positions",
        channelId,
        randomUUID(),
        "client_chat",
        undefined,
        randomUUID(),
        {
          channelType: "DM",
          isDm: true,
          targetUserId: agentId,
          userAddressId: userId,
          chainId: TEST_CONFIG.chainId,
        }
      );

      // Collect all responses for this conversation
      const responses: any[] = [];
      let positionResponseReceived = false;

      // Wait for MANAGE_POSITIONS response
      const responsePromise = new Promise<void>((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId) {
            responses.push(data);

            console.log("=== RECEIVED RESPONSE ===");
            console.log(`Actions: ${data.actions?.join(", ") || "none"}`);
            console.log(`Text: ${data.text}`);
            console.log("=== END RESPONSE ===");

            // Check if this is a MANAGE_POSITIONS action
            if (data.actions?.includes("MANAGE_POSITIONS")) {
              positionResponseReceived = true;
              detach.detach();
              resolve();
            }
          }
        });

        // Timeout after 15 seconds
        setTimeout(() => {
          detach.detach();
          resolve();
        }, 15000);
      });

      await responsePromise;

      expect(positionResponseReceived).toBe(true);
      expect(responses.length).toBeGreaterThan(0);

      // Find the MANAGE_POSITIONS response
      const positionResponse = responses.find((r) =>
        r.actions?.includes("MANAGE_POSITIONS")
      );
      expect(positionResponse).toBeDefined();

      const responseText = positionResponse.text;

      // Check for duplication issues
      const strategyMentions = (responseText.match(/Strategy \d+/g) || [])
        .length;
      const totalValueMentions = (
        responseText.match(/Total Portfolio Value/gi) || []
      ).length;

      // Each strategy should be mentioned at most once (no duplication)
      // Allow some flexibility but prevent excessive duplication
      expect(strategyMentions).toBeLessThan(8); // Should not have excessive mentions
      expect(totalValueMentions).toBeLessThanOrEqual(1); // Should have single total value

      // Check for logical consistency in withdrawal status
      const hasPendingInDetails = responseText.includes("Pending withdrawals");
      const summaryDeniesWithdrawals = responseText
        .toLowerCase()
        .includes("no pending withdrawals");

      // Should not have contradictory withdrawal status
      if (hasPendingInDetails) {
        expect(summaryDeniesWithdrawals).toBe(false);
      }

      // Check formatting quality
      const excessiveNewlines = responseText.includes("\n\n\n\n\n\n");
      expect(excessiveNewlines).toBe(false);

      console.log("Position response validation results:", {
        strategyMentions,
        totalValueMentions,
        hasPendingInDetails,
        summaryDeniesWithdrawals,
        responseLength: responseText.length,
        hasExcessiveNewlines: excessiveNewlines,
      });
    }, 30000);

    it("should maintain consistency across multiple position queries", async () => {
      const { socket, userId, channelId } = context;

      // Clear previous messages
      await client.messaging.clearChannelHistory(channelId);

      // First query
      const response1 = await socket.sendMessage({
        channelId,
        userId,
        text: "What are my current positions?",
      });

      // Second query (should not duplicate information from first)
      const response2 = await socket.sendMessage({
        channelId,
        userId,
        text: "Show me my portfolio",
      });

      expect(response1).toBeDefined();
      expect(response2).toBeDefined();

      console.log("=== FIRST RESPONSE ===");
      console.log(response1.text);
      console.log("=== SECOND RESPONSE ===");
      console.log(response2.text);
      console.log("=== END RESPONSES ===");

      // Second response should not repeat detailed position data from first
      // It should either reference the previous response or provide new value
      const response1Text = response1.text;
      const response2Text = response2.text;

      // Check that second response doesn't just repeat the same detailed data
      const response1HasDetails =
        response1Text.includes("$") && response1Text.includes("Balance:");
      const response2HasDetails =
        response2Text.includes("$") && response2Text.includes("Balance:");

      if (response1HasDetails && response2HasDetails) {
        // If both have details, they should be different or second should reference first
        const hasReference =
          response2Text.toLowerCase().includes("above") ||
          response2Text.toLowerCase().includes("as you can see") ||
          response2Text.toLowerCase().includes("building on");

        // Either should reference previous or provide genuinely different information
        expect(hasReference || response1Text !== response2Text).toBe(true);
      }

      console.log("Consistency validation results:", {
        response1HasDetails,
        response2HasDetails,
        response1Length: response1Text.length,
        response2Length: response2Text.length,
        hasReference:
          response2Text.toLowerCase().includes("above") ||
          response2Text.toLowerCase().includes("as you can see") ||
          response2Text.toLowerCase().includes("building on"),
      });
    }, 30000);
  });

  describe("Strategy Response Quality", () => {
    it("should not duplicate strategy information in SELECT_STRATEGY responses", async () => {
      const { socket, userId, channelId } = context;

      await client.messaging.clearChannelHistory(channelId);

      const response = await socket.sendMessage({
        channelId,
        userId,
        text: "What investment strategies do you recommend?",
      });

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();

      const responseText = response.text;
      console.log("=== STRATEGY RESPONSE ===");
      console.log(responseText);
      console.log("=== END RESPONSE ===");

      // Check for duplication in strategy descriptions
      const ultraSafeMentions = (responseText.match(/ultra-safe/gi) || [])
        .length;
      const safeMentions = (responseText.match(/\bsafe\b/gi) || []).length;
      const braveMentions = (responseText.match(/brave/gi) || []).length;

      // Each strategy should not be excessively repeated
      expect(ultraSafeMentions).toBeLessThan(5);
      expect(safeMentions).toBeLessThan(5);
      expect(braveMentions).toBeLessThan(5);

      // Check formatting
      const excessiveNewlines = responseText.includes("\n\n\n\n\n\n");
      expect(excessiveNewlines).toBe(false);

      console.log("Strategy response validation results:", {
        ultraSafeMentions,
        safeMentions,
        braveMentions,
        responseLength: responseText.length,
      });
    }, 30000);
  });

  describe("Swap Response Quality", () => {
    it("should not duplicate swap information in SWAP_TOKENS responses", async () => {
      const { socket, userId, channelId } = context;

      await client.messaging.clearChannelHistory(channelId);

      const response = await socket.sendMessage({
        channelId,
        userId,
        text: "I want to swap 100 USDC for ETH",
      });

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();

      const responseText = response.text;
      console.log("=== SWAP RESPONSE ===");
      console.log(responseText);
      console.log("=== END RESPONSE ===");

      // Check for duplication in swap details
      const usdcMentions = (responseText.match(/USDC/g) || []).length;
      const ethMentions = (responseText.match(/ETH/g) || []).length;
      const amountMentions = (responseText.match(/100/g) || []).length;

      // Should not excessively repeat swap details
      expect(usdcMentions).toBeLessThan(6);
      expect(ethMentions).toBeLessThan(6);
      expect(amountMentions).toBeLessThan(6);

      // Check formatting
      const excessiveNewlines = responseText.includes("\n\n\n\n\n\n");
      expect(excessiveNewlines).toBe(false);

      console.log("Swap response validation results:", {
        usdcMentions,
        ethMentions,
        amountMentions,
        responseLength: responseText.length,
      });
    }, 30000);
  });

  describe("Wallet Response Quality", () => {
    it("should not duplicate wallet information in ANALYZE_WALLET responses", async () => {
      const { socket, userId, channelId } = context;

      await client.messaging.clearChannelHistory(channelId);

      const response = await socket.sendMessage({
        channelId,
        userId,
        text: "Analyze my wallet and suggest improvements",
      });

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();

      const responseText = response.text;
      console.log("=== WALLET RESPONSE ===");
      console.log(responseText);
      console.log("=== END RESPONSE ===");

      // Check for duplication in wallet analysis
      const balanceMentions = (responseText.match(/balance/gi) || []).length;
      const addressMentions = (responseText.match(/0x[a-fA-F0-9]{40}/g) || [])
        .length;

      // Should not excessively repeat wallet details
      expect(balanceMentions).toBeLessThan(8);
      expect(addressMentions).toBeLessThanOrEqual(2); // Address should appear at most twice

      // Check formatting
      const excessiveNewlines = responseText.includes("\n\n\n\n\n\n");
      expect(excessiveNewlines).toBe(false);

      console.log("Wallet response validation results:", {
        balanceMentions,
        addressMentions,
        responseLength: responseText.length,
      });
    }, 30000);
  });
});
