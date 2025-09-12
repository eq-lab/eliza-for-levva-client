import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { setupChatTest, teardownChatTest, type ChatTestContext, TEST_CONFIG } from "./setup";

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
      
      const { client, socket, userId, agentId, channelId } = context;
      
      await client.messaging.clearChannelHistory(channelId);

      const responsePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId && data.actions?.includes("ANALYZE_WALLET")) {
            detach.detach();
            resolve(data);
          }
        });
        setTimeout(() => {
          detach.detach();
          resolve(null);
        }, 10000);
      });

      socket.sendMessage(
        "Analyze my wallet",
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

      const response = await responsePromise;
      expect(response).toBeDefined();
    }, 15000);

    it("should handle position management request", async () => {
      if (!context) throw new Error("Test context not initialized");
      
      const { client, socket, userId, agentId, channelId } = context;
      
      await client.messaging.clearChannelHistory(channelId);

      const responsePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId && data.actions?.includes("MANAGE_POSITIONS")) {
            detach.detach();
            resolve(data);
          }
        });
        setTimeout(() => {
          detach.detach();
          resolve(null);
        }, 10000);
      });

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

      const response = await responsePromise;
      expect(response).toBeDefined();
    }, 15000);

    it("should handle swap request", async () => {
      if (!context) throw new Error("Test context not initialized");
      
      const { client, socket, userId, agentId, channelId } = context;
      
      await client.messaging.clearChannelHistory(channelId);

      const responsePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId && data.actions?.includes("SWAP_TOKENS")) {
            detach.detach();
            resolve(data);
          }
        });
        setTimeout(() => {
          detach.detach();
          resolve(null);
        }, 10000);
      });

      socket.sendMessage(
        "I want to swap 100 USDC for ETH",
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

      const response = await responsePromise;
      expect(response).toBeDefined();
    }, 15000);

    it("should handle strategy recommendation request", async () => {
      if (!context) throw new Error("Test context not initialized");
      
      const { client, socket, userId, agentId, channelId } = context;
      
      await client.messaging.clearChannelHistory(channelId);

      const responsePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId && data.actions?.includes("SELECT_STRATEGY")) {
            detach.detach();
            resolve(data);
          }
        });
        setTimeout(() => {
          detach.detach();
          resolve(null);
        }, 10000);
      });

      socket.sendMessage(
        "What investment strategies do you recommend?",
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

      const response = await responsePromise;
      expect(response).toBeDefined();
    }, 15000);
  });
});
