import { randomUUID } from "crypto";
import { AgentClient } from "../utils/client/client";
import { SocketIOManager, MessageBroadcastData } from "../utils/client/socket";

// Test configuration - using actual values from example.ts
export const SECRET =
  "0x6edf00f6b2e3984835a36d12ef94b11014cd98378fc1c32d7caf5bb3614751ae1362b375d8d46175e8e953a8867142bdd8d804d7439e6a1416cba5e19821fe9b12ca053e02ae94c09cf25668ba58eaefd0cd44d9a72b5c04ee3899e9c598ffc163d3adec539fab900a8001651f212723358697521349010c094405c0300386c2c15c5a9a9976924258d0a8c5f5cf0eb031c2c32a7089b5189d35c64c89056719007069026df3bb58271a56f91df2e6a72f9f8177e96213b6088acf46ae2ef8e0d8e321c94a14717ab2a6dccccb44e199c574497eefdccb0025f08bc735022efa0590f8be4eff6b8794dc655adffe41f1f701461dd44e091bc3d83e58ecc40d9a18260240abb8c2d35400089bb228be653ee5eb85842451f09a9488388d5a55d4e6dbd61b3b67765fe306fad94569f7e338c707c45b80457ed15ec15bc46b37e173c71e0e80144ac9ede6db665063444eaf6f3837ed7421e517a0dc19dcc4b88508cf648ea7ad984930682f0116a02b52c02136cddf71cc971334f228c36b7b665b1722a4e8768b862cc96f26b115e2b613f54efa3456660967ebf138083c8678f13c695b36e18aae9bcc6524a68286a0b591ae5a562cfb97e958ef3fdfadafba74de182d6df5e117a7d8ae33da81ddd56f92866b30cd72fb0df553d9e48c045504d0ec60c9d11dc8356aa879976163943c26b27aaa66c1e3bbcb38cabfb59c27";
export const ADDRESS = "0x40b88b09610487A26b18FB52DBe319D1268fCa22";

export const TEST_CONFIG = {
  baseUrl: process.env.ELIZA_BASE_URL || "http://localhost:3001",
  secret: SECRET,
  address: ADDRESS as `0x${string}`,
  chainId: 8453,
  timeout: 30000, // 30 seconds timeout for responses
};

export interface ChatTestContext {
  client: AgentClient;
  socket: SocketIOManager;
  userId: string;
  agentId: string;
  channelId: string;
}

export async function setupChatTest(): Promise<ChatTestContext> {
  // Configure socket manager
  SocketIOManager.config = {
    baseUrl: TEST_CONFIG.baseUrl,
  };

  // Create client and socket instances
  const client = AgentClient.getOrCreateInstance({
    baseUrl: TEST_CONFIG.baseUrl,
  });
  const socket = SocketIOManager.getInstance();

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

  // Initialize socket connection
  socket.initialize(userId);
  await socket.joinChannel(channelId);

  return { client, socket, userId, agentId, channelId };
}

export function teardownChatTest(context: ChatTestContext | undefined) {
  if (context?.socket) {
    context.socket.disconnect();
  }
}

// Helper to send message and wait for agent's complete response
export async function sendMessageAndWaitForComplete(
  context: ChatTestContext,
  text: string
): Promise<MessageBroadcastData[]> {
  const { socket, agentId, channelId, userId } = context;

  return new Promise((resolve, reject) => {
    const agentMessages: MessageBroadcastData[] = [];

    const timeout = setTimeout(() => {
      messageDetach.detach();
      completeDetach.detach();
      reject(new Error(`Timeout waiting for agent response to: "${text}"`));
    }, TEST_CONFIG.timeout);

    // Listen for all agent messages
    const messageDetach = socket.evtMessageBroadcast.attach((data) => {
      if (data.senderId === agentId && data.channelId === channelId) {
        agentMessages.push(data);
      }
    });

    // Wait for messageComplete event
    const completeDetach = socket.evtMessageComplete.attach((data) => {
      if (data.channelId === channelId && agentMessages.length > 0) {
        clearTimeout(timeout);
        messageDetach.detach();
        completeDetach.detach();
        resolve(agentMessages);
      }
    });

    // Send the message
    socket.sendMessage(
      text,
      channelId,
      randomUUID(),
      "client_chat",
      undefined,
      randomUUID(),
      {
        userAddressId: userId,
        chainId: TEST_CONFIG.chainId,
        isDm: true,
        targetUserId: agentId,
      }
    );
  });
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
