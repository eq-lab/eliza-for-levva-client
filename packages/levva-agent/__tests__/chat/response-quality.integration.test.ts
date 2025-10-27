import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  type ChatTestContext,
  sendMessageAndWaitForComplete,
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

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      // Send position request and wait for complete response
      const responses = await sendMessageAndWaitForComplete(
        context,
        "Show me my positions"
      );

      // Find position response
      const positionResponse = responses.find((message) =>
        message.actions?.includes("MANAGE_POSITIONS")
      );

      console.log("=== RECEIVED RESPONSES ===");
      responses.forEach((message) => {
        console.log(`Actions: ${message.actions?.join(", ") || "none"}`);
        console.log(`Text: ${message.text}`);
      });
      console.log("=== END RESPONSES ===");

      expect(positionResponse).toBeDefined();
      expect(responses.length).toBeGreaterThan(0);

      const responseText = positionResponse?.text;

      // Check for duplication issues
      const strategyMentions = (responseText?.match(/Strategy \d+/g) || [])
        .length;
      const totalValueMentions = (
        responseText?.match(/Total Portfolio Value/gi) || []
      ).length;

      // Each strategy should be mentioned at most once (no duplication)
      // Allow some flexibility but prevent excessive duplication
      expect(strategyMentions).toBeLessThan(8); // Should not have excessive mentions
      expect(totalValueMentions).toBeLessThanOrEqual(1); // Should have single total value

      // Check for logical consistency in withdrawal status
      const hasPendingInDetails = responseText?.includes("Pending withdrawals");
      const summaryDeniesWithdrawals = responseText
        ?.toLowerCase()
        .includes("no pending withdrawals");

      // Should not have contradictory withdrawal status
      if (hasPendingInDetails) {
        expect(summaryDeniesWithdrawals).toBe(false);
      }

      // Check formatting quality
      const excessiveNewlines = responseText?.includes("\n\n\n\n\n\n");
      expect(excessiveNewlines).toBe(false);

      console.log("Position response validation results:", {
        strategyMentions,
        totalValueMentions,
        hasPendingInDetails,
        summaryDeniesWithdrawals,
        responseLength: responseText?.length,
        hasExcessiveNewlines: excessiveNewlines,
      });
    }, 60000);

    it("should maintain consistency across multiple position queries", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      // First query
      const response1 = await sendMessageAndWaitForComplete(
        context,
        "What are my current positions?"
      );

      // Second query (should not duplicate information from first)
      const response2 = await sendMessageAndWaitForComplete(
        context,
        "Show me my portfolio"
      );

      expect(response1.length).toBeGreaterThan(0);
      expect(response2.length).toBeGreaterThan(0);
      const response1Text = response1.map((r) => r.text).join("\n");
      const response2Text = response2.map((r) => r.text).join("\n");

      console.log("=== FIRST RESPONSE ===");
      console.log(response1Text);
      console.log("=== SECOND RESPONSE ===");
      console.log(response2Text);
      console.log("=== END RESPONSES ===");

      // TODO: I think we should check from all messages in response
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
    }, 60000);
  });

  describe("Strategy Response Quality", () => {
    it("should not duplicate strategy information in SELECT_STRATEGY responses", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const responses = await sendMessageAndWaitForComplete(
        context,
        "What investment strategies do you recommend?"
      );

      expect(responses.length).toBeGreaterThan(0);

      const responseText = responses.map((r) => r.text).join("\n");
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
    }, 60000);
  });

  describe("Swap Response Quality", () => {
    it("should not duplicate swap information in SWAP_TOKENS responses", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const responses = await sendMessageAndWaitForComplete(
        context,
        "I want to swap 100 USDC for ETH"
      );

      expect(responses.length).toBeGreaterThan(0);

      const responseText = responses.map((r) => r.text).join("\n");
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
    }, 60000);
  });

  describe("Wallet Response Quality", () => {
    it("should not duplicate wallet information in ANALYZE_WALLET responses", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const responses = await sendMessageAndWaitForComplete(
        context,
        "Analyze my wallet and suggest improvements"
      );

      expect(responses.length).toBeGreaterThan(0);

      const responseText = responses.map((r) => r.text).join("\n");
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
    }, 60000);
  });
});
