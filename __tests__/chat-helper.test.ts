import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chatTestHelper, ChatSession } from "./utils/chat-test-helper";
import {
  DEFAULT_TEST_CONFIG,
  TEST_MESSAGES,
  EXPECTED_KEYWORDS,
} from "./utils/test-constants";

describe("Chat Helper Tests", () => {
  let session: ChatSession;

  beforeAll(async () => {
    session = await chatTestHelper.createSession(DEFAULT_TEST_CONFIG);
  });

  afterAll(() => {
    if (session) {
      session.disconnect();
    }
    chatTestHelper.cleanup();
  });

  describe("Basic Chat Operations", () => {
    it("should create a chat session successfully", () => {
      expect(session).toBeDefined();
      expect(session.userId).toBeTruthy();
      expect(session.agentId).toBeTruthy();
      expect(session.channelId).toBeTruthy();
    });

    it("should send a message and receive a response", async () => {
      session.sendMessage(TEST_MESSAGES.greeting);

      const response = await session.waitForResponse();

      expect(response).toBeDefined();
      expect(response.text).toBeTruthy();
      expect(response.senderId).toBe(session.agentId);
    });

    it("should handle conversation flow", async () => {
      const flow = [
        {
          message: TEST_MESSAGES.help,
          expectedKeywords: EXPECTED_KEYWORDS.help,
        },
        {
          message: TEST_MESSAGES.defi,
          expectedKeywords: EXPECTED_KEYWORDS.defi,
        },
      ];

      const responses = await chatTestHelper.testConversationFlow(
        session,
        flow
      );

      expect(responses).toHaveLength(2);
      responses.forEach((response) => {
        expect(response.text).toBeTruthy();
      });
    });
  });

  describe("Levva-Specific Actions", () => {
    it("should handle wallet analysis request", async () => {
      const response = await chatTestHelper.testLevvaAction(
        session,
        "wallet",
        TEST_MESSAGES.wallet
      );

      expect(response).toBeDefined();
      expect(response.text).toBeTruthy();
    });

    it("should handle position management request", async () => {
      const response = await chatTestHelper.testLevvaAction(
        session,
        "position",
        TEST_MESSAGES.positions
      );

      expect(response).toBeDefined();
      expect(response.text).toBeTruthy();
    });

    it("should handle swap request", async () => {
      const response = await chatTestHelper.testLevvaAction(
        session,
        "swap",
        TEST_MESSAGES.swap
      );

      expect(response).toBeDefined();
      expect(response.text).toBeTruthy();
    });

    it("should handle strategy recommendation request", async () => {
      const response = await chatTestHelper.testLevvaAction(
        session,
        "strategy",
        TEST_MESSAGES.strategy
      );

      expect(response).toBeDefined();
      expect(response.text).toBeTruthy();
    });
  });

  describe("API Integration", () => {
    it("should fetch suggestions", async () => {
      const suggestions = await chatTestHelper.testSuggestions(
        session,
        DEFAULT_TEST_CONFIG
      );

      expect(Array.isArray(suggestions)).toBe(true);
      // Suggestions might be empty, but should be an array
    });

    it("should check agent status", async () => {
      const status = await chatTestHelper.testAgentStatus(
        session,
        DEFAULT_TEST_CONFIG
      );

      expect(status).toBeDefined();
      expect(typeof status.ready).toBe("boolean");
    });
  });

  describe("Channel Management", () => {
    it("should clear channel history", async () => {
      // Send a test message
      session.sendMessage(TEST_MESSAGES.clear);
      await session.waitForResponse();

      // Clear the channel
      await session.clearChannel();

      // Verify channel is cleared by checking messages
      const messages = await session.client.messaging.getChannelMessages(
        session.channelId
      );
      expect(messages.messages).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle timeout gracefully", async () => {
      // Send a message and wait with a very short timeout
      session.sendMessage("This should timeout");

      await expect(
        session.waitForResponse(undefined, 100) // 100ms timeout
      ).rejects.toThrow("Timeout");
    });

    it("should handle filtered responses", async () => {
      session.sendMessage(TEST_MESSAGES.blockchain);

      // Wait for a response that contains "blockchain"
      const response = await session.waitForResponse((data) =>
        data.text.toLowerCase().includes("blockchain")
      );

      expect(response.text.toLowerCase()).toContain("blockchain");
    });
  });
});
