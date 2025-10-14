import { randomUUID, UUID } from "crypto";
import { AgentClient } from "../utils/client/client";
import { SocketIOManager } from "../utils/socket/manager";
import type { MessageBroadcastData } from "../utils/socket/types";
import type { ClientEntity } from "../utils/socket/entity";

// Test configuration - using actual values from example.ts
export const SECRET =
  "0x6edf00f6b2e3984835a36d12ef94b11014cd98378fc1c32d7caf5bb3614751ae1362b375d8d46175e8e953a8867142bdd8d804d7439e6a1416cba5e19821fe9b12ca053e02ae94c09cf25668ba58eaefd0cd44d9a72b5c04ee3899e9c598ffc163d3adec539fab900a8001651f212723358697521349010c094405c0300386c2c15c5a9a9976924258d0a8c5f5cf0eb031c2c32a7089b5189d35c64c89056719007069026df3bb58271a56f91df2e6a72f9f8177e96213b6088acf46ae2ef8e0d8e321c94a14717ab2a6dccccb44e199c574497eefdccb0025f08bc735022efa0590f8be4eff6b8794dc655adffe41f1f701461dd44e091bc3d83e58ecc40d9a18260240abb8c2d35400089bb228be653ee5eb85842451f09a9488388d5a55d4e6dbd61b3b67765fe306fad94569f7e338c707c45b80457ed15ec15bc46b37e173c71e0e80144ac9ede6db665063444eaf6f3837ed7421e517a0dc19dcc4b88508cf648ea7ad984930682f0116a02b52c02136cddf71cc971334f228c36b7b665b1722a4e8768b862cc96f26b115e2b613f54efa3456660967ebf138083c8678f13c695b36e18aae9bcc6524a68286a0b591ae5a562cfb97e958ef3fdfadafba74de182d6df5e117a7d8ae33da81ddd56f92866b30cd72fb0df553d9e48c045504d0ec60c9d11dc8356aa879976163943c26b27aaa66c1e3bbcb38cabfb59c27";
export const ADDRESS = "0x40b88b09610487A26b18FB52DBe319D1268fCa22";

export const TEST_CONFIG = {
  baseUrl: process.env.ELIZA_BASE_URL || "http://localhost:3001",
  secret: SECRET,
  address: ADDRESS as `0x${string}`,
  chainId: 1, // Ethereum mainnet - where test positions exist
  timeout: 30000, // 30 seconds timeout for responses
} as const;

export interface ChatTestContext {
  client: AgentClient;
  socket: ClientEntity;
  userId: UUID;
  agentId: UUID;
  channelId: UUID;
}

/**
 * Check if the ElizaOS server is running
 */
export async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(
      `${TEST_CONFIG.baseUrl}/api/levva/status?address=${TEST_CONFIG.address}`
    );
    return response?.ok ?? false;
  } catch {
    return false;
  }
}

export async function setupChatTest(): Promise<ChatTestContext> {
  if (!isServerRunning()) {
    throw new Error("Server is not running");
  }

  // Configure socket manager
  SocketIOManager.configure({
    baseUrl: TEST_CONFIG.baseUrl,
  });

  // Create client and socket instances
  const client = AgentClient.getOrCreateInstance({
    baseUrl: TEST_CONFIG.baseUrl,
  });

  const manager = SocketIOManager.getInstance();

  // Get or create user - this returns the Levva user ID (database ID for the address)
  const levvaUser = await client.levva.getUserId({
    secret: TEST_CONFIG.secret,
    address: TEST_CONFIG.address as `0x${string}`,
  });

  if (!levvaUser?.id) {
    throw new Error("Failed to get Levva user ID");
  }
  const userId = levvaUser.id; // This is the user ID we need for everything

  // Get available agents
  const agents = await client.agents.listAgents();
  const agent = agents.agents?.[0];

  if (!agent) {
    throw new Error("No agents available");
  }
  const agentId = agent.id;

  // Create DM channel
  const channel = await client.messaging.getOrCreateDmChannel({
    participantIds: [userId, agentId],
  });
  const channelId = channel.id;

  const socket = manager.initClient(userId);
  await socket.joinChannel(channelId);

  return { client, socket, userId, agentId, channelId };
}

export function teardownChatTest(context: ChatTestContext | undefined) {
  if (context?.socket) {
    context.socket.disconnect();
  }
}

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

const TIMEOUT_MESSAGE: MessageBroadcastData = {
  id: NULL_UUID,
  senderId: NULL_UUID,
  channelId: NULL_UUID,
  content: { text: "Timeout waiting for agent response" },
  createdAt: Date.now(),
  senderName: "agent",
  text: "Timeout waiting for agent response",
  source: "client_chat",
  name: "agent",
};

export const checkTimeout = (data: MessageBroadcastData[]): boolean => {
  const [last] = data.slice(-1);

  if (last?.text.includes("Timeout waiting for agent response")) {
    return true;
  }

  return false;
};

// Helper to send message and wait for agent's complete response
export async function sendMessageAndWaitForComplete(
  context: ChatTestContext,
  text: string
): Promise<MessageBroadcastData[]> {
  const { socket, agentId, channelId, userId } = context;
  const data: MessageBroadcastData[] = [];

  const messageId = await socket.sendMessage(
    text,
    channelId,
    randomUUID(),
    "client_chat",
    undefined,
    {
      userAddressId: userId,
      chainId: TEST_CONFIG.chainId,
      isDm: true,
      targetUserId: agentId,
    }
  );

  for await (const message of socket.getRepliesIterator(messageId)) {
    data.push(message);
  }

  if (socket.isTimedOut) {
    data.push(TIMEOUT_MESSAGE);
  }

  return data;
}

// Helper function to calculate text similarity
export function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Helper function to run multi-step conversation flow tests
 *
 * @param context - Test context with client and channel info
 * @param steps - Array of test steps to execute sequentially
 * @returns Promise that resolves when all steps are complete
 */
export async function runMultiStepFlow(
  context: ChatTestContext,
  steps: Array<{
    message: string;
    validate: (responses: any[], suggestions: any[]) => void | Promise<void>;
  }>
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(
      `\n📤 STEP ${i + 1}/${steps.length}: Sending: "${step.message}"`
    );

    // Send message and wait for responses
    const responses = await sendMessageAndWaitForComplete(
      context,
      step.message
    );
    console.log(`📊 Received ${responses.length} responses`);

    // Log responses
    responses.forEach((response, j) => {
      console.log(
        `\n  ${j + 1}. Action: ${response.actions?.join(", ") || "NONE"}`
      );
      console.log(
        `     Text: ${response.text?.substring(0, 150)}${response.text?.length > 150 ? "..." : ""}`
      );
    });

    // Wait for suggestions to be generated
    console.log("\n⏳ Waiting for suggestions to be generated...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Get suggestions
    const suggestionsResponse = await context.client.levva.getSuggestions(
      ADDRESS,
      context.channelId,
      TEST_CONFIG.chainId
    );

    const suggestions = suggestionsResponse.suggestions || [];
    console.log(`\n💡 Suggestions (${suggestions.length}):`);
    suggestions.forEach((suggestion, j) => {
      console.log(`  ${j + 1}. "${suggestion.label}" - ${suggestion.text}`);
    });

    // Run validation for this step
    await step.validate(responses, suggestions);
  }
}
