import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { AgentClient } from "./utils/client/client";
import { SocketIOManager } from "./utils/client/socket";

// Test configuration - using actual values from example.ts
const SECRET =
  "0x6edf00f6b2e3984835a36d12ef94b11014cd98378fc1c32d7caf5bb3614751ae1362b375d8d46175e8e953a8867142bdd8d804d7439e6a1416cba5e19821fe9b12ca053e02ae94c09cf25668ba58eaefd0cd44d9a72b5c04ee3899e9c598ffc163d3adec539fab900a8001651f212723358697521349010c094405c0300386c2c15c5a9a9976924258d0a8c5f5cf0eb031c2c32a7089b5189d35c64c89056719007069026df3bb58271a56f91df2e6a72f9f8177e96213b6088acf46ae2ef8e0d8e321c94a14717ab2a6dccccb44e199c574497eefdccb0025f08bc735022efa0590f8be4eff6b8794dc655adffe41f1f701461dd44e091bc3d83e58ecc40d9a18260240abb8c2d35400089bb228be653ee5eb85842451f09a9488388d5a55d4e6dbd61b3b67765fe306fad94569f7e338c707c45b80457ed15ec15bc46b37e173c71e0e80144ac9ede6db665063444eaf6f3837ed7421e517a0dc19dcc4b88508cf648ea7ad984930682f0116a02b52c02136cddf71cc971334f228c36b7b665b1722a4e8768b862cc96f26b115e2b613f54efa3456660967ebf138083c8678f13c695b36e18aae9bcc6524a68286a0b591ae5a562cfb97e958ef3fdfadafba74de182d6df5e117a7d8ae33da81ddd56f92866b30cd72fb0df553d9e48c045504d0ec60c9d11dc8356aa879976163943c26b27aaa66c1e3bbcb38cabfb59c27";
const ADDRESS = "0x40b88b09610487A26b18FB52DBe319D1268fCa22";

const TEST_CONFIG = {
  baseUrl: process.env.ELIZA_BASE_URL || "http://localhost:3001",
  secret: SECRET,
  address: ADDRESS as `0x${string}`,
  chainId: parseInt(process.env.ELIZA_CHAIN_ID || "1"),
  timeout: 30000, // 30 seconds timeout for responses
};

describe("Chat Instance Integration Tests", () => {
  let client: AgentClient;
  let socket: SocketIOManager;
  let userId: string;
  let agentId: string;
  let channelId: string;

  beforeAll(async () => {
    // Configure socket manager
    SocketIOManager.config = {
      baseUrl: TEST_CONFIG.baseUrl,
    };

    // Create client and socket instances
    client = AgentClient.getOrCreateInstance({
      baseUrl: TEST_CONFIG.baseUrl,
    });
    socket = SocketIOManager.getInstance();

    // Get or create user
    const user = await client.levva.getUserId({
      secret: TEST_CONFIG.secret,
      address: TEST_CONFIG.address as `0x${string}`,
    });

    if (!user?.id) {
      throw new Error("Failed to get user ID");
    }
    userId = user.id;

    // Get available agents
    const agents = await client.agents.listAgents();
    const agent = agents.agents?.[0];

    if (!agent) {
      throw new Error("No agents available");
    }
    agentId = agent.id;

    // Create DM channel
    const channel = await client.messaging.getOrCreateDmChannel({
      currentUserId: userId,
      targetUserId: agentId,
    });
    channelId = channel.id;

    // Initialize socket connection
    socket.initialize(userId);
    socket.joinChannel(channelId);
  });

  afterAll(async () => {
    // Clean up socket connections
    if (socket) {
      socket.disconnect();
    }
  });

  describe("Basic Chat Functionality", () => {
    it("should establish connection and receive initial messages", async () => {
      const initialMessages =
        await client.messaging.getChannelMessages(channelId);
      expect(initialMessages).toBeDefined();
      expect(Array.isArray(initialMessages.messages)).toBe(true);
    });

    it("should send a simple greeting message", async () => {
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

      const response = await Promise.race([
        messagePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TEST_CONFIG.timeout)
        ),
      ]);

      expect(response).toBeDefined();
      expect((response as any).text).toBeTruthy();
    });
  });

  describe("Levva-Specific Chat Tests", () => {
    it("should handle wallet analysis request", async () => {
      const messagePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId && data.text.includes("portfolio")) {
            detach.detach();
            resolve(data);
          }
        });
      });

      socket.sendMessage(
        "Show me my wallet analysis",
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

      const response = await Promise.race([
        messagePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TEST_CONFIG.timeout)
        ),
      ]);

      expect(response).toBeDefined();
    });

    it("should handle position management request", async () => {
      const messagePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId) {
            detach.detach();
            resolve(data);
          }
        });
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

      const response = await Promise.race([
        messagePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TEST_CONFIG.timeout)
        ),
      ]);

      expect(response).toBeDefined();
    });

    it("should handle swap request", async () => {
      const messagePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId) {
            detach.detach();
            resolve(data);
          }
        });
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

      const response = await Promise.race([
        messagePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TEST_CONFIG.timeout)
        ),
      ]);

      expect(response).toBeDefined();
    });

    it("should handle strategy recommendation request", async () => {
      const messagePromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId) {
            detach.detach();
            resolve(data);
          }
        });
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

      const response = await Promise.race([
        messagePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TEST_CONFIG.timeout)
        ),
      ]);

      expect(response).toBeDefined();
    });
  });

  describe("Socket Event Handling", () => {
    it("should receive message broadcast events", async () => {
      const eventPromise = new Promise((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          detach.detach();
          resolve(data);
        });
      });

      socket.sendMessage(
        "Test message for broadcast event",
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

      const event = await Promise.race([
        eventPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TEST_CONFIG.timeout)
        ),
      ]);

      expect(event).toBeDefined();
      expect((event as any).channelId).toBe(channelId);
    });

    it("should receive message complete events", async () => {
      const completePromise = new Promise((resolve) => {
        const detach = socket.evtMessageComplete.attach((data) => {
          detach.detach();
          resolve(data);
        });
      });

      socket.sendMessage(
        "Test message for complete event",
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

      const event = await Promise.race([
        completePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), TEST_CONFIG.timeout)
        ),
      ]);

      expect(event).toBeDefined();
      expect((event as any).channelId).toBe(channelId);
    });
  });

  describe("Suggestions API", () => {
    it("should fetch suggestions for user", async () => {
      const suggestions = await client.levva.getSuggestions(
        TEST_CONFIG.address as `0x${string}`,
        channelId,
        TEST_CONFIG.chainId
      );

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions.suggestions)).toBe(true);
    });
  });

  describe("Status API", () => {
    it("should check agent status", async () => {
      const status = await client.levva.status(
        TEST_CONFIG.address as `0x${string}`
      );

      expect(status).toBeDefined();
      expect(typeof status.ready).toBe("boolean");
    });
  });

  describe("Channel Management", () => {
    it("should clear channel history", async () => {
      // Send a test message first
      socket.sendMessage(
        "Test message to be cleared",
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

      // Wait a bit for the message to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Clear the channel
      await client.messaging.clearChannelHistory(channelId);

      // Verify the channel is cleared
      const messages = await client.messaging.getChannelMessages(channelId);
      expect(messages.messages.length).toBe(0);
    });
  });

  describe("Position Duplication Issue", () => {
    it("should not duplicate position information between REPLY and MANAGE_POSITIONS actions", async () => {
      // Clear channel to start fresh as recommended
      await client.messaging.clearChannelHistory(channelId);

      // Send position request
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
      let replyReceived = false;
      let managePositionsReceived = false;

      // Wait for both REPLY and MANAGE_POSITIONS responses
      const responsePromise = new Promise<void>((resolve) => {
        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId) {
            responses.push(data);

            console.log(
              `Received response with actions: ${data.actions?.join(", ") || "none"}`
            );
            console.log(`Response text: ${data.text.substring(0, 100)}...`);

            // Check if this is a REPLY action
            if (data.actions?.includes("REPLY")) {
              replyReceived = true;
              console.log("REPLY action received");
            }

            // Check if this is a MANAGE_POSITIONS action
            if (data.actions?.includes("MANAGE_POSITIONS")) {
              managePositionsReceived = true;
              console.log("MANAGE_POSITIONS action received");
            }

            // If we've received both, resolve
            if (replyReceived && managePositionsReceived) {
              detach.detach();
              resolve();
            }
          }
        });
      });

      // Wait for responses with timeout
      await Promise.race([
        responsePromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout waiting for responses")),
            45000
          )
        ),
      ]);

      // Verify we got both responses
      expect(responses.length).toBeGreaterThanOrEqual(2);
      expect(replyReceived).toBe(true);
      expect(managePositionsReceived).toBe(true);

      // Find the REPLY and MANAGE_POSITIONS responses
      const replyResponse = responses.find((r) => r.actions?.includes("REPLY"));
      const managePositionsResponse = responses.find((r) =>
        r.actions?.includes("MANAGE_POSITIONS")
      );

      expect(replyResponse).toBeDefined();
      expect(managePositionsResponse).toBeDefined();

      console.log("\n=== REPLY Response ===");
      console.log(replyResponse.text);
      console.log("\n=== MANAGE_POSITIONS Response ===");
      console.log(managePositionsResponse.text);

      // Check for duplication by looking for repeated key phrases
      const replyText = replyResponse.text.toLowerCase();
      const manageText = managePositionsResponse.text.toLowerCase();

      // Look for common position-related phrases that might be duplicated
      const positionPhrases = [
        "strategy 1",
        "safe yield",
        "origin weth vault",
        "maximised long-term growth",
        "total portfolio value",
        "$3.36",
        "$1.00",
        "$21.61",
        "$2.00",
        "$27.97",
      ];

      const duplicatedPhrases: string[] = [];

      positionPhrases.forEach((phrase) => {
        if (replyText.includes(phrase) && manageText.includes(phrase)) {
          duplicatedPhrases.push(phrase);
        }
      });

      // Log duplicated content for debugging
      if (duplicatedPhrases.length > 0) {
        console.log("\n=== DUPLICATION ANALYSIS ===");
        console.log("Duplicated phrases found:", duplicatedPhrases);
        console.log(
          `Duplication rate: ${duplicatedPhrases.length}/${positionPhrases.length} (${Math.round((duplicatedPhrases.length / positionPhrases.length) * 100)}%)`
        );
        console.log(
          "This indicates the rephrase utility is not effectively deduplicating content"
        );
      }

      // Check for specific duplicated sentences/structures
      const commonStructures = [
        "here's your current position summary",
        "total portfolio value",
        "pending withdrawals",
      ];

      const structuralDuplication = commonStructures.filter(
        (structure) =>
          replyText.includes(structure.toLowerCase()) &&
          manageText.includes(structure.toLowerCase())
      );

      if (structuralDuplication.length > 0) {
        console.log("Structural duplication found:", structuralDuplication);
      }

      // The test should fail if there's significant duplication
      // We allow some overlap (like total value) but not complete duplication
      expect(duplicatedPhrases.length).toBeLessThan(
        positionPhrases.length * 0.7
      ); // Less than 70% duplication

      // Also check that the responses are meaningfully different
      const similarity = calculateTextSimilarity(replyText, manageText);
      console.log(`Text similarity: ${Math.round(similarity * 100)}%`);

      // Responses should not be more than 80% similar
      expect(similarity).toBeLessThan(0.8);
    });
  });

  describe("Refactored Actions Integration Tests", () => {
    // Helper function to wait for multiple actions
    const waitForActions = (expectedActions: string[], timeout = 30000) => {
      return new Promise<any[]>((resolve, reject) => {
        const responses: any[] = [];
        const receivedActions = new Set<string>();

        const detach = socket.evtMessageBroadcast.attach((data) => {
          if (data.senderId === agentId) {
            responses.push(data);

            // Track received actions
            if (data.actions) {
              data.actions.forEach((action: string) =>
                receivedActions.add(action)
              );
            }

            // Check if we have all expected actions
            const hasAllActions = expectedActions.every((action) =>
              receivedActions.has(action)
            );

            if (hasAllActions) {
              detach.detach();
              resolve(responses);
            }
          }
        });

        setTimeout(() => {
          detach.detach();
          reject(
            new Error(
              `Timeout waiting for actions: ${expectedActions.join(", ")}`
            )
          );
        }, timeout);
      });
    };

    describe("SELECT_STRATEGY Action Improvements", () => {
      it("should handle strategy selection without duplication", async () => {
        await client.messaging.clearChannelHistory(channelId);

        socket.sendMessage(
          "I want to invest in a safe strategy",
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

        const responses = await waitForActions(
          ["REPLY", "SELECT_STRATEGY"],
          25000
        );
        expect(responses).toHaveLength(2);

        const replyResponse = responses.find((r) =>
          r.actions?.includes("REPLY")
        );
        const strategyResponse = responses.find((r) =>
          r.actions?.includes("SELECT_STRATEGY")
        );

        expect(replyResponse).toBeDefined();
        expect(strategyResponse).toBeDefined();

        // Check for duplication between responses
        const similarity = calculateTextSimilarity(
          replyResponse.text,
          strategyResponse.text
        );
        console.log(
          `Strategy selection similarity: ${Math.round(similarity * 100)}%`
        );

        // Should have low similarity (< 40%)
        expect(similarity).toBeLessThan(0.4);

        // Strategy response should provide new value
        expect(strategyResponse.text).toMatch(
          /(strategy|invest|option|choose|select)/i
        );
      }, 35000);
    });

    describe("SWAP_TOKENS Action Improvements", () => {
      it("should handle swap requests without duplication", async () => {
        await client.messaging.clearChannelHistory(channelId);

        socket.sendMessage(
          "I want to swap 10 USDC for ETH",
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

        const responses = await waitForActions(["REPLY", "SWAP_TOKENS"], 25000);
        expect(responses).toHaveLength(2);

        const replyResponse = responses.find((r) =>
          r.actions?.includes("REPLY")
        );
        const swapResponse = responses.find((r) =>
          r.actions?.includes("SWAP_TOKENS")
        );

        expect(replyResponse).toBeDefined();
        expect(swapResponse).toBeDefined();

        // Check for duplication
        const similarity = calculateTextSimilarity(
          replyResponse.text,
          swapResponse.text
        );
        console.log(`Swap similarity: ${Math.round(similarity * 100)}%`);
        expect(similarity).toBeLessThan(0.5);

        // Swap response should provide transaction details or ask for confirmation
        expect(swapResponse.text).toMatch(
          /(transaction|approve|wallet|insufficient|balance)/i
        );
      }, 35000);
    });

    describe("ANALYZE_WALLET Action Improvements", () => {
      it("should provide wallet analysis without duplication", async () => {
        await client.messaging.clearChannelHistory(channelId);

        socket.sendMessage(
          "Show me my wallet analysis",
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

        const responses = await waitForActions(
          ["REPLY", "ANALYZE_WALLET"],
          25000
        );
        expect(responses).toHaveLength(2);

        const replyResponse = responses.find((r) =>
          r.actions?.includes("REPLY")
        );
        const walletResponse = responses.find((r) =>
          r.actions?.includes("ANALYZE_WALLET")
        );

        expect(replyResponse).toBeDefined();
        expect(walletResponse).toBeDefined();

        // Check for duplication
        const similarity = calculateTextSimilarity(
          replyResponse.text,
          walletResponse.text
        );
        console.log(
          `Wallet analysis similarity: ${Math.round(similarity * 100)}%`
        );
        expect(similarity).toBeLessThan(0.6);

        // Wallet response should provide detailed analysis
        expect(walletResponse.text).toMatch(
          /(portfolio|holdings|tokens|strategy|recommend)/i
        );
        expect(replyResponse.text).not.toBe(walletResponse.text);
      }, 35000);
    });

    describe("Cross-Action Coordination", () => {
      it("should coordinate between multiple actions without duplication", async () => {
        await client.messaging.clearChannelHistory(channelId);

        socket.sendMessage(
          "Show me my portfolio and suggest what to do next",
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

        const responses = await waitForActions(["REPLY"], 30000);
        expect(responses.length).toBeGreaterThanOrEqual(2);

        // Check that each response provides unique value
        for (let i = 0; i < responses.length; i++) {
          for (let j = i + 1; j < responses.length; j++) {
            const similarity = calculateTextSimilarity(
              responses[i].text,
              responses[j].text
            );
            console.log(
              `Response ${i + 1} vs ${j + 1} similarity: ${Math.round(similarity * 100)}%`
            );

            // Each response should be sufficiently different
            expect(similarity).toBeLessThan(0.5);
          }
        }

        // All responses should be meaningful
        responses.forEach((response, index) => {
          expect(response.text.length).toBeGreaterThan(20);
          console.log(
            `Response ${index + 1} (${response.actions?.join(", ") || "none"}): ${response.text.substring(0, 100)}...`
          );
        });
      }, 40000);
    });

    describe("Logical Consistency Validation", () => {
      it("should maintain logical consistency in position responses", async () => {
        await client.messaging.clearChannelHistory(channelId);

        socket.sendMessage(
          "Show me my current positions",
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

        const responses = await waitForActions(
          ["REPLY", "MANAGE_POSITIONS"],
          25000
        );
        expect(responses).toHaveLength(2);

        // Check for logical consistency (the main fix we implemented)
        for (const response of responses) {
          const text = response.text.toLowerCase();

          // Check for contradictory statements about withdrawals
          const hasPendingMention = text.includes("pending withdrawal");
          const hasNoPendingMention =
            text.includes("no pending withdrawal") ||
            text.includes("with no pending") ||
            text.includes("without pending");

          // These should not both be true in the same response
          if (hasPendingMention && hasNoPendingMention) {
            console.error("Contradictory response found:");
            console.error("Response text:", response.text);
          }

          expect(hasPendingMention && hasNoPendingMention).toBe(false);
        }

        console.log("✅ All responses are logically consistent");
      }, 35000);
    });

    describe("Performance Validation", () => {
      it("should respond within reasonable time limits", async () => {
        await client.messaging.clearChannelHistory(channelId);

        const startTime = Date.now();

        socket.sendMessage(
          "Quick portfolio check",
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

        const responses = await waitForActions(["REPLY"], 10000);
        const responseTime = Date.now() - startTime;
        console.log(`Response time: ${responseTime}ms`);

        expect(responses.length).toBeGreaterThanOrEqual(1);
        expect(responseTime).toBeLessThan(8000); // Should respond within 8 seconds
      }, 15000);
    });
  });
});

// Helper function to calculate text similarity
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}
