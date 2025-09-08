import { randomUUID } from "crypto";
import { AgentClient } from "./client/client";
import { SocketIOManager, MessageBroadcastData } from "./client/socket";

export interface ChatTestConfig {
  baseUrl: string;
  secret: string;
  address: `0x${string}`;
  chainId: number;
  timeout?: number;
}

export interface ChatSession {
  client: AgentClient;
  socket: SocketIOManager;
  userId: string;
  agentId: string;
  channelId: string;
  sendMessage: (message: string, metadata?: Record<string, unknown>) => void;
  waitForResponse: (
    filter?: (data: MessageBroadcastData) => boolean,
    timeout?: number
  ) => Promise<MessageBroadcastData>;
  clearChannel: () => Promise<void>;
  disconnect: () => void;
}

export class ChatTestHelper {
  private static instance: ChatTestHelper;
  private sessions: Map<string, ChatSession> = new Map();

  static getInstance(): ChatTestHelper {
    if (!ChatTestHelper.instance) {
      ChatTestHelper.instance = new ChatTestHelper();
    }
    return ChatTestHelper.instance;
  }

  /**
   * Create a new chat session for testing
   */
  async createSession(
    config: ChatTestConfig,
    sessionId?: string
  ): Promise<ChatSession> {
    const id = sessionId || randomUUID();

    // Configure socket manager
    SocketIOManager.config = {
      baseUrl: config.baseUrl,
    };

    // Create client and socket instances
    const client = AgentClient.getOrCreateInstance({
      baseUrl: config.baseUrl,
    });
    const socket = SocketIOManager.getInstance();

    // Get or create user
    const user = await client.levva.getUserId({
      secret: config.secret,
      address: config.address,
    });

    if (!user?.id) {
      throw new Error("Failed to get user ID");
    }

    // Get available agents
    const agents = await client.agents.listAgents();
    const agent = agents.agents?.[0];

    if (!agent) {
      throw new Error("No agents available");
    }

    // Create DM channel
    const channel = await client.messaging.getOrCreateDmChannel({
      currentUserId: user.id,
      targetUserId: agent.id,
    });

    // Initialize socket connection
    socket.initialize(user.id);
    socket.joinChannel(channel.id);

    const sendMessage = (
      message: string,
      metadata: Record<string, unknown> = {}
    ) => {
      socket.sendMessage(
        message.trim(),
        channel.id,
        randomUUID(),
        "client_chat",
        undefined,
        randomUUID(),
        {
          channelType: "DM",
          isDm: true,
          targetUserId: agent.id,
          userAddressId: user.id,
          chainId: config.chainId,
          ...metadata,
        }
      );
    };

    const waitForResponse = (
      filter?: (data: MessageBroadcastData) => boolean,
      timeout: number = config.timeout || 30000
    ): Promise<MessageBroadcastData> => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Timeout waiting for response after ${timeout}ms`));
        }, timeout);

        const detach = socket.evtMessageBroadcast.attach((data) => {
          // Default filter: agent messages only
          const defaultFilter = (d: MessageBroadcastData) =>
            d.senderId === agent.id;
          const shouldResolve = filter ? filter(data) : defaultFilter(data);

          if (shouldResolve) {
            clearTimeout(timeoutId);
            detach.detach();
            resolve(data);
          }
        });
      });
    };

    const clearChannel = () => client.messaging.clearChannelHistory(channel.id);

    const disconnect = () => {
      socket.disconnect();
      this.sessions.delete(id);
    };

    const session: ChatSession = {
      client,
      socket,
      userId: user.id,
      agentId: agent.id,
      channelId: channel.id,
      sendMessage,
      waitForResponse,
      clearChannel,
      disconnect,
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clean up all sessions
   */
  cleanup(): void {
    for (const session of this.sessions.values()) {
      session.disconnect();
    }
    this.sessions.clear();
  }

  /**
   * Test a conversation flow with expected responses
   */
  async testConversationFlow(
    session: ChatSession,
    flow: Array<{
      message: string;
      expectedKeywords?: string[];
      responseFilter?: (data: MessageBroadcastData) => boolean;
      timeout?: number;
    }>
  ): Promise<MessageBroadcastData[]> {
    const responses: MessageBroadcastData[] = [];

    for (const step of flow) {
      // Send message
      session.sendMessage(step.message);

      // Wait for response
      const response = await session.waitForResponse(
        step.responseFilter ||
          ((data) => {
            if (step.expectedKeywords) {
              return step.expectedKeywords.some((keyword) =>
                data.text.toLowerCase().includes(keyword.toLowerCase())
              );
            }
            return true;
          }),
        step.timeout
      );

      responses.push(response);
    }

    return responses;
  }

  /**
   * Test specific Levva actions
   */
  async testLevvaAction(
    session: ChatSession,
    actionType: "swap" | "position" | "strategy" | "wallet",
    message: string,
    timeout?: number
  ): Promise<MessageBroadcastData> {
    const actionKeywords = {
      swap: ["swap", "exchange", "trade"],
      position: ["position", "portfolio", "balance"],
      strategy: ["strategy", "invest", "recommend"],
      wallet: ["wallet", "analysis", "assets"],
    };

    session.sendMessage(message);

    return session.waitForResponse(
      (data) =>
        actionKeywords[actionType].some((keyword) =>
          data.text.toLowerCase().includes(keyword.toLowerCase())
        ) || data.actions?.includes(actionType.toUpperCase()),
      timeout
    );
  }

  /**
   * Verify that suggestions are available for a user
   */
  async testSuggestions(
    session: ChatSession,
    config: ChatTestConfig
  ): Promise<{ label: string; text: string }[]> {
    const suggestions = await session.client.levva.getSuggestions(
      config.address,
      session.channelId,
      config.chainId
    );

    return suggestions.suggestions;
  }

  /**
   * Test agent status
   */
  async testAgentStatus(
    session: ChatSession,
    config: ChatTestConfig
  ): Promise<{ ready: boolean }> {
    return session.client.levva.status(config.address);
  }
}

// Export a default instance for convenience
export const chatTestHelper = ChatTestHelper.getInstance();
