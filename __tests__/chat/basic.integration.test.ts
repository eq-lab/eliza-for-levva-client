import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  checkTimeout,
  sendMessageAndWaitForComplete,
  setupChatTest,
  teardownChatTest,
  type ChatTestContext,
} from "./setup";

describe("Basic Chat Integration Tests", () => {
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

  describe("Connection and Basic Functionality", () => {
    it("should establish connection and receive initial messages", async () => {
      if (!context) throw new Error("Test context not initialized");

      const { client, channelId } = context;

      const initialMessages =
        await client.messaging.getChannelMessages(channelId);
      expect(initialMessages).toBeDefined();
      expect(Array.isArray(initialMessages.messages)).toBe(true);
    });

    it("should send a simple greeting message", async () => {
      if (!context) throw new Error("Test context not initialized");

      // Cleanup before querying agent
      await context.client.levva.cleanupChannel(
        context.channelId,
        context.userId
      );
      await context.client.messaging.clearChannelHistory(context.channelId);

      const data = await sendMessageAndWaitForComplete(
        context,
        "Hello! How are you?"
      );

      expect(checkTimeout(data)).toBe(false);
      expect(data.length).toBeGreaterThan(1);
    }, 60000);
  });
});
