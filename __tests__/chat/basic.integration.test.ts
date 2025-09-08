import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { setupChatTest, teardownChatTest, type ChatTestContext } from "./setup";

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

      const { socket, agentId } = context;

      const messagePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId) {
            detach.detach();
            resolve(data);
          }
        });
      });

      socket.sendMessage(
        "Hello! How are you?",
        context.channelId,
        randomUUID(),
        "client_chat",
        undefined,
        randomUUID()
      );

      const response = await messagePromise;
      expect(response).toBeDefined();
    });
  });

  describe("Socket Event Handling", () => {
    it("should receive message broadcast events", async () => {
      if (!context) throw new Error("Test context not initialized");

      const { socket, channelId } = context;

      let eventReceived = false;
      const detach = socket.evtMessageBroadcast.attach(() => {
        eventReceived = true;
        detach.detach();
      });

      socket.sendMessage(
        "Test message",
        channelId,
        randomUUID(),
        "client_chat",
        undefined,
        randomUUID()
      );

      // Wait a bit for the event
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(eventReceived).toBe(true);
    });

    it("should receive message complete events", async () => {
      if (!context) throw new Error("Test context not initialized");

      const { socket, channelId } = context;

      let completeEventReceived = false;
      const detach = socket.evtMessageComplete.attach(() => {
        completeEventReceived = true;
        detach.detach();
      });

      socket.sendMessage(
        "Complete test",
        channelId,
        randomUUID(),
        "client_chat",
        undefined,
        randomUUID()
      );

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(completeEventReceived).toBe(true);
    });
  });
});
