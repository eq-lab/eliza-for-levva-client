import {
  IAgentRuntime,
  Service,
  HandlerCallback,
  Memory,
  State,
  ModelType,
  logger,
  ActionResult,
} from "@elizaos/core";
import { randomUUID } from "crypto";
import { LEVVA_SERVICE, LEVVA_ACTIONS, INTENT_TYPE } from "../constants/enum";
import {
  createIntentDetectionPrompt,
  IntentOption,
  LLMIntentAnalysis,
} from "../prompts/intent";

export interface IntentContext {
  id: string;
  type: INTENT_TYPE;
  domain: LEVVA_ACTIONS;
  createdAt: number;
  userId: string;
  channelId: string;
  metadata?: Record<string, any>;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  memories?: Memory[];

  // Intent hierarchy and relationships
  parentIntentId?: string; // For child intents (e.g., SWAP initiated from INCREASE_POSITION)
  childIntentIds?: string[]; // For parent intents tracking their children

  // Cross-intent data passing
  inheritedData?: Record<string, any>; // Data passed from parent intent
  returnData?: Record<string, any>; // Data to return to parent when completed
}

export interface IntentHandler {
  (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    callback: HandlerCallback,
    intentContext: IntentContext,
    prevActions?: any
  ): Promise<ActionResult>;
}

export interface IntentRegistration {
  type: INTENT_TYPE;
  domain: LEVVA_ACTIONS;
  keywords: string[];
  handler: IntentHandler;
  description?: string;
}

export interface IntentDetectionResult {
  intentType: INTENT_TYPE | null;
  confidence: number;
  extractedValues?: Record<string, any>;
  reasoning?: string;
}

// Simplified intent relationship rules:
// 1. Intents in the same domain cancel each other
// 2. Intents in different domains can access parent intent data

export class IntentManager extends Service {
  static serviceType = LEVVA_SERVICE.INTENT_MANAGER;

  capabilityDescription =
    "Intent management service for tracking user intents across conversation flows and managing intent hierarchy and conflicts.";

  // Static registry for intent handlers
  private static intentRegistry: Map<string, IntentRegistration> = new Map();

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async stop(): Promise<void> {
    // Clean up any resources if needed
    // For now, no cleanup is required
  }

  static async start(runtime: IAgentRuntime): Promise<IntentManager> {
    return new IntentManager(runtime);
  }

  /**
   * Register an intent type with its handler for a specific domain
   */
  static registerIntent(registration: IntentRegistration): void {
    const key = `${registration.domain}:${registration.type}`;
    this.intentRegistry.set(key, registration);

    logger.info(
      `Registered intent: ${registration.type} for domain ${registration.domain}`
    );
  }

  /**
   * Get registered intent by domain and type
   */
  static getRegisteredIntent(
    domain: LEVVA_ACTIONS,
    type: INTENT_TYPE
  ): IntentRegistration | undefined {
    const key = `${domain}:${type}`;
    return this.intentRegistry.get(key);
  }

  /**
   * Get all registered intents for a domain
   */
  static getRegisteredIntentsForDomain(
    domain: LEVVA_ACTIONS
  ): IntentRegistration[] {
    return Array.from(this.intentRegistry.values()).filter(
      (registration) => registration.domain === domain
    );
  }

  /**
   * Execute a registered intent handler
   */
  async executeIntentHandler(
    intentContext: IntentContext,
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    callback: HandlerCallback,
    prevActions?: any
  ): Promise<ActionResult> {
    const registration = IntentManager.getRegisteredIntent(
      intentContext.domain,
      intentContext.type
    );

    if (!registration) {
      throw new Error(
        `No handler registered for intent ${intentContext.type} in domain ${intentContext.domain}`
      );
    }

    return await registration.handler(
      runtime,
      message,
      state,
      callback,
      intentContext,
      prevActions
    );
  }

  async createIntent(
    intentData: Omit<IntentContext, "id" | "createdAt" | "status">,
    parentIntent?: IntentContext
  ): Promise<IntentContext> {
    const prevIntent = await this.getActiveIntentByDomain(
      intentData.userId,
      intentData.channelId,
      intentData.domain
    );

    if (prevIntent?.status === "ACTIVE") {
      if (prevIntent?.type === intentData.type) {
        throw new Error(
          "Intent has the same type; should not have been called"
        );
      }

      await this.cancelIntent(prevIntent);
    }

    const intent: IntentContext = {
      ...intentData,
      id: `${intentData.type.toLowerCase()}_${Date.now()}_${randomUUID().slice(0, 8)}`,
      createdAt: Date.now(),
      status: "ACTIVE",
      parentIntentId: parentIntent?.id,
      inheritedData: parentIntent?.returnData || {},
    };

    // Update parent intent if this is a child
    if (parentIntent) {
      parentIntent.childIntentIds = [
        ...(parentIntent.childIntentIds || []),
        intent.id,
      ];

      await this.storeIntent(parentIntent);
    }

    await this.storeIntent(intent);
    return intent;
  }

  async addMemoryToIntent(intent: IntentContext, memory: Memory) {
    if (intent.memories?.find((m) => m.id === memory.id)) {
      return;
    }

    intent.memories = [...(intent.memories || []), memory];
    await this.storeIntent(intent);
  }

  async getActiveIntentByDomain(
    userId: string,
    channelId: string,
    domain: LEVVA_ACTIONS
  ) {
    const cacheKey = `intent_${domain}_${userId}_${channelId}`;
    const intent = await this.runtime.getCache<IntentContext>(cacheKey);
    return intent?.status === "ACTIVE" ? intent : undefined;
  }

  async getActiveIntentByReply(reply: Memory): Promise<IntentContext | null> {
    try {
      const { id: messageId, roomId } = reply;
      const room = await this.runtime.getRoom(roomId);

      if (!room) {
        throw new Error(`Room not found: ${roomId}`);
      }

      // fixme relies on room name that extected to have `User${uuid}` format
      const userId = room.name?.startsWith("User") ? room.name.slice(4) : null;

      if (!userId) {
        throw new Error(
          `User ID not valid(result = ${userId}, room = ${room.name})`
        );
      }

      const channelId = room.channelId;

      if (!channelId) {
        logger.debug(`No channel ID found in room: ${roomId}`);
        return null;
      }

      // Get recent messages from the conversation
      const recentMessages = await this.runtime.getMemories({
        roomId,
        count: 20, // Look at last 20 messages
        unique: false,
        tableName: "messages",
      });

      if (!recentMessages || recentMessages.length === 0) {
        logger.debug("No recent messages found");
        return null;
      }

      // Find the current user message and previous user message
      const currentUserMessage = reply;
      let currentMessageIndex = -1;
      let previousUserMessageIndex = -1;

      // Find current message index
      for (let i = 0; i < recentMessages.length; i++) {
        if (recentMessages[i].id === currentUserMessage.id) {
          currentMessageIndex = i;
          break;
        }
      }

      if (currentMessageIndex === -1) {
        logger.debug("Current message not found in recent messages");
        return null;
      }

      const agentResponses: Memory[] = [];

      // Find previous user message (same user, but earlier)
      for (let i = currentMessageIndex + 1; i < recentMessages.length; i++) {
        const msg = recentMessages[i];
        const msgRaw = (msg.metadata as any)?.raw;
        const msgChannelId = msgRaw?.channelId;

        // Check if this is a user message (not agent response) from the same channel
        if (msgChannelId === channelId && !msg.content?.actions) {
          previousUserMessageIndex = i;
          break;
        }

        agentResponses.push(msg);
      }

      if (!agentResponses.length) {
        logger.debug("No previous user message found");
        return null;
      }

      logger.debug("Found agent responses to analyze", {
        agentResponses,
        currentMessageIndex,
        previousUserMessageIndex,
      });

      // Look for intent IDs in agent response data
      // TODO we can create a set on intent registration not to hardcode domains
      const validDomains = [
        "MANAGE_POSITIONS",
        "SWAP_TOKENS",
        "SELECT_STRATEGY",
      ];

      for (const memory of agentResponses) {
        const actions: string[] | undefined = memory.content.actionName
          ? ([memory.content.actionName] as string[])
          : memory.content.actions;
        const domain = actions?.find((name) => validDomains.includes(name));
        if (domain) {
          // Try to get the intent by ID
          const intent = await this.getActiveIntentByDomain(
            userId,
            channelId,
            domain as any
          );

          if (intent && intent.status === "ACTIVE") {
            logger.info("Found active intent from agent responses", {
              intentId: intent.id,
              intentType: intent.type,
              domain: intent.domain,
              fromResponseId: messageId,
            });

            return intent;
          }
        }
      }

      logger.debug("No active intents found in agent responses or by domain");
      return null;
    } catch (error) {
      logger.error("Error finding active intent from reply:", error);
      return null;
    }
  }

  async getIntentById(intentId: string): Promise<IntentContext | null> {
    const cacheKey = `intent_id_${intentId}`;
    const cached = await this.runtime.getCache<IntentContext>(cacheKey);
    return cached || null;
  }

  /** @deprecated not the most efficient way to store intents, consider implementing dedicated schema */
  async storeIntent(intent: IntentContext) {
    // Store by domain for conflict detection
    const domainCacheKey = `intent_${intent.domain}_${intent.userId}_${intent.channelId}`;
    await this.runtime.setCache(domainCacheKey, intent);

    // Store by ID for direct lookup
    const idCacheKey = `intent_id_${intent.id}`;
    await this.runtime.setCache(idCacheKey, intent);
  }

  async cancelIntent(intent: IntentContext) {
    intent.status = "CANCELLED";
    await this.storeIntent(intent);

    // Cancel any child intents
    if (intent.childIntentIds && intent.childIntentIds.length > 0) {
      for (const childId of intent.childIntentIds) {
        const childIntent = await this.getIntentById(childId);

        if (childIntent && childIntent.status === "ACTIVE") {
          await this.cancelIntent(childIntent);
        }
      }
    }
  }

  async completeIntent(intent: IntentContext) {
    intent.status = "COMPLETED";
    await this.storeIntent(intent);
  }

  /**
   * Enhanced LLM-based intent detection that analyzes registered intents
   * and extracts values for the detected intent
   */
  async detectIntentWithLLM(
    message: Memory,
    domain: LEVVA_ACTIONS = LEVVA_ACTIONS.MANAGE_POSITIONS
  ): Promise<IntentDetectionResult> {
    // Check cache first
    const cacheKey = `intent_detection:${message.id}:${domain}`;
    const cached = await this.runtime.getCache(cacheKey);
    if (cached) {
      return cached as IntentDetectionResult;
    }
    try {
      // Get all registered intents for the domain
      const domainIntents = IntentManager.getRegisteredIntentsForDomain(domain);

      if (domainIntents.length === 0 || !message.content.text) {
        const result = {
          intentType: null,
          confidence: 0,
          reasoning: "No registered intents found for domain",
        };

        await this.runtime.setCache(cacheKey, result);
        return result;
      }

      // Create prompt for LLM analysis
      const intentOptions: IntentOption[] = domainIntents.map((intent) => ({
        type: intent.type,
        description: intent.description || `Intent for ${intent.type}`,
        keywords: intent.keywords,
      }));

      const prompt = createIntentDetectionPrompt(
        message.content.text,
        intentOptions,
        domain
      );

      // Use LLM to analyze intent
      const response = await this.runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt,
      });

      const analysis = response as LLMIntentAnalysis;

      const result = {
        intentType: analysis.selectedIntent,
        confidence: analysis.confidence,
        extractedValues: analysis.extractedValues,
        reasoning: analysis.reasoning,
      };

      // Cache the result
      await this.runtime.setCache(cacheKey, result);
      return result;
    } catch (error) {
      this.runtime.logger.error("Error in LLM intent detection:", error);

      // Fallback to simple keyword detection
      const result = this.fallbackKeywordDetection(
        message.content.text ?? "",
        domain
      );

      await this.runtime.setCache(cacheKey, result);
      return result;
    }
  }

  /**
   * Fallback keyword-based detection for when LLM fails
   */
  private fallbackKeywordDetection(
    message: string,
    domain: LEVVA_ACTIONS
  ): IntentDetectionResult {
    const messageText = message.toLowerCase();

    // Get registered intents and use their keywords
    const domainIntents = IntentManager.getRegisteredIntentsForDomain(domain);

    for (const intent of domainIntents) {
      const hasKeyword = intent.keywords.some((keyword) =>
        messageText.includes(keyword.toLowerCase())
      );

      if (hasKeyword) {
        return {
          intentType: intent.type,
          confidence: 0.7, // Medium confidence for keyword match
          reasoning: `Keyword match for ${intent.type}`,
        };
      }
    }

    // No default intent for position management - let action handle default behavior

    return {
      intentType: null,
      confidence: 0,
      reasoning: "No matching intent found",
    };
  }
}
