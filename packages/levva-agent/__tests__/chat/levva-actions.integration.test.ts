import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupChatTest,
  teardownChatTest,
  type ChatTestContext,
  sendMessageAndWaitForComplete,
  checkTimeout,
} from "./setup";

describe("Levva Actions Integration Tests", () => {
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

  describe("Core Levva Actions", () => {
    it("should handle wallet analysis request", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const data = await sendMessageAndWaitForComplete(
        context,
        "Analyze my wallet"
      );

      expect(checkTimeout(data)).toBe(false);
      expect(data.length).toBeGreaterThan(1);
      // todo test criteria
    }, 60000);

    it("should handle position management request", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const data = await sendMessageAndWaitForComplete(
        context,
        "Show me my positions"
      );

      expect(checkTimeout(data)).toBe(false);
      expect(data.length).toBeGreaterThan(1);
      // todo test criteria
    }, 60000);

    it("should handle swap request", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const data = await sendMessageAndWaitForComplete(
        context,
        "I want to swap 100 USDC for ETH"
      );

      const messagesStr = data.map((message) => message.text).join("\n");
      expect(checkTimeout(data)).toBe(false);
      expect(data.length).toBeGreaterThan(1);

      const hasCallData = data.some((message) =>
        message.attachments?.some(
          (attachment) => attachment.id === "calls.json"
        )
      );
      expect(hasCallData, `Messages: ${messagesStr}`).toBe(true);
    }, 60000);

    it("should handle strategy recommendation request", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const data = await sendMessageAndWaitForComplete(
        context,
        "What investment strategies do you recommend?"
      );

      expect(checkTimeout(data)).toBe(false);
      expect(data.length).toBeGreaterThan(1);
      // todo test criteria
    }, 60000);
  });
});
