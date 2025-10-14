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
import { INTENT_CONFIDENCE_THRESHOLD } from "../constants/intent";
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
  // NEW: Intent-aware suggestion generator
  generateSuggestions?: (params: {
    runtime: IAgentRuntime;
    intentContext: IntentContext;
    conversation: string;
    userAddress: `0x${string}`;
    chainId: number;
  }) => Promise<string>;
}

export interface IntentDetectionResult {
  intentType: INTENT_TYPE | undefined;
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
   * Generate intent-aware suggestions using the intent's own generator
   */
  async generateIntentSuggestions(params: {
    intentContext: IntentContext;
    conversation: string;
    userAddress: `0x${string}`;
    chainId: number;
  }): Promise<string | undefined> {
    const { intentContext } = params;
    const registration = IntentManager.getRegisteredIntent(
      intentContext.domain,
      intentContext.type
    );

    if (!registration?.generateSuggestions) {
      return undefined;
    }

    return registration.generateSuggestions({
      runtime: this.runtime,
      ...params,
    });
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
   * Check if an intent type is registered for a specific domain
   */
  static isIntentRegisteredForDomain(
    domain: LEVVA_ACTIONS,
    intentType: INTENT_TYPE
  ): boolean {
    const key = `${domain}:${intentType}`;
    return this.intentRegistry.has(key);
  }

  /**
   * Get all registered intent types for a domain
   */
  static getRegisteredIntentTypesForDomain(
    domain: LEVVA_ACTIONS
  ): INTENT_TYPE[] {
    return this.getRegisteredIntentsForDomain(domain).map(
      (registration) => registration.type
    );
  }

  /**
   * Get all registered intents across all domains
   */
  static getRegisteredIntents(): Map<string, IntentRegistration> {
    return this.intentRegistry;
  }

  /**
   * Validate if detected intent belongs to the expected domain
   */
  static validateIntentForDomain(
    domain: LEVVA_ACTIONS,
    intentType: INTENT_TYPE | undefined
  ): boolean {
    if (!intentType) return false;
    return this.isIntentRegisteredForDomain(domain, intentType);
  }

  /**
   * Instance method to validate intent for domain (preferred over static)
   */
  validateIntentForDomain(
    domain: LEVVA_ACTIONS,
    intentType: INTENT_TYPE | undefined
  ): boolean {
    return IntentManager.validateIntentForDomain(domain, intentType);
  }

  /**
   * Instance method to get registered intent types for domain
   */
  getRegisteredIntentTypesForDomain(domain: LEVVA_ACTIONS): INTENT_TYPE[] {
    return IntentManager.getRegisteredIntentTypesForDomain(domain);
  }

  /**
   * Helper function to handle intent detection and creation logic
   * This consolidates the common pattern used across providers
   */
  async handleIntentDetectionAndCreation(
    message: Memory,
    domain: LEVVA_ACTIONS,
    userId: string,
    channelId: string,
    existingIntentContext?: IntentContext,
    confidenceThreshold: number = INTENT_CONFIDENCE_THRESHOLD
  ): Promise<IntentContext | undefined> {
    try {
      // Check if there's a recently cancelled intent for this domain
      // This prevents immediate re-creation after user cancels
      const cacheKey = `intent_${domain}_${userId}_${channelId}`;
      const cachedIntent = await this.runtime.getCache<IntentContext>(cacheKey);
      
      if (cachedIntent?.status === "CANCELLED") {
        const timeSinceCancellation = Date.now() - (cachedIntent.metadata?.cancelledAt || 0);
        const CANCELLATION_GRACE_PERIOD = 10000; // 10 seconds
        
        if (timeSinceCancellation < CANCELLATION_GRACE_PERIOD) {
          this.runtime.logger.info(
            `[INTENT-DETECTION] Skipping detection - intent recently cancelled (${Math.round(timeSinceCancellation / 1000)}s ago)`,
            {
              domain,
              intentId: cachedIntent.id,
              intentType: cachedIntent.type,
            }
          );
          return undefined;
        }
      }

      // Detect intent from current message
      const detect = await this.detectIntentWithLLM(message, domain);

      this.runtime.logger.debug(
        `[INTENT-DETECTION] LLM result for domain ${domain}:`,
        {
          intentType: detect?.intentType,
          confidence: detect?.confidence,
          threshold: confidenceThreshold,
          existingType: existingIntentContext?.type,
        }
      );

      // Create new intent if detected, valid for domain, and different from existing
      if (
        detect?.intentType &&
        detect.confidence > confidenceThreshold &&
        this.validateIntentForDomain(domain, detect.intentType) &&
        detect.intentType !== existingIntentContext?.type
      ) {
        // Get parent intent by previous message's domain
        const parentIntent = await this.getActiveIntentByReply(message);

        const intentContext = await this.createIntent(
          {
            type: detect.intentType as INTENT_TYPE,
            domain: domain,
            userId: userId,
            channelId: channelId,
            memories: [],
            returnData: detect.extractedValues || {},
            metadata: {
              detectedAt: Date.now(),
              confidence: detect.confidence,
              reasoning: detect.reasoning,
            },
          },
          parentIntent ?? undefined
        );

        this.runtime.logger.info(
          `[INTENT-DETECTION] Created new intent: ${intentContext.id} (${intentContext.type}) with confidence ${detect.confidence}`
        );

        return intentContext;
      }

      return existingIntentContext || undefined;
    } catch (error) {
      this.runtime.logger.warn(
        "Error in intent detection and creation:",
        error
      );
      return existingIntentContext || undefined;
    }
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
    };

    // Update parent intent if this is a child
    if (
      parentIntent &&
      parentIntent.status === "ACTIVE" &&
      parentIntent.type !== intentData.type
    ) {
      intent.parentIntentId = parentIntent?.id;
      intent.inheritedData = parentIntent?.returnData || {};

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

    // DEBUG LOGGING
    this.runtime.logger.debug(
      `[getActiveIntentByDomain] Domain: ${domain}, CacheKey: ${cacheKey}, Found: ${!!intent}, Status: ${intent?.status}, ID: ${intent?.id}`
    );

    return intent?.status === "ACTIVE" ? intent : undefined;
  }

  /**
   * Get all active intents for a channel across all possible userIds
   * This is used for cleanup to find orphaned intents
   */
  async getAllActiveIntentsInChannel(
    channelId: string
  ): Promise<IntentContext[]> {
    const activeIntents: IntentContext[] = [];

    // Get all registered domains
    const allDomains = Array.from(IntentManager.getRegisteredIntents().values())
      .map((registration) => registration.domain)
      .filter((domain, index, self) => self.indexOf(domain) === index);

    // For each domain, we need to check common userId patterns
    // This is a workaround since we can't do wildcard cache lookups
    // We'll check for the "unknown" userId specifically (common orphan case)
    const userIdsToCheck = ["unknown", "user"];

    for (const domain of allDomains) {
      for (const userId of userIdsToCheck) {
        const cacheKey = `intent_${domain}_${userId}_${channelId}`;
        try {
          const intent = await this.runtime.getCache<IntentContext>(cacheKey);
          if (intent?.status === "ACTIVE" && intent.channelId === channelId) {
            activeIntents.push(intent);
            this.runtime.logger.debug(
              `[getAllActiveIntentsInChannel] Found orphaned intent: ${intent.id} (userId: ${intent.userId})`
            );
          }
        } catch (error) {
          // Cache key doesn't exist, continue
        }
      }
    }

    return activeIntents;
  }

  async getActiveIntentsByChannel(channelId: string): Promise<IntentContext[]> {
    const intents: IntentContext[] = [];

    // Get all registered intent types
    const allIntentTypes = Array.from(IntentManager.intentRegistry.values());

    // Check cache for each intent type and domain combination
    for (const registration of allIntentTypes) {
      // Since we don't have userId here, we need to scan cache keys
      // This is a simplified approach - in production you might want to maintain a channel index
      const cacheKey = `intent_${registration.domain}_*_${channelId}`;
      // Note: This requires a pattern-based cache lookup which might not be available
      // For now, we'll rely on the fact that intents are stored with predictable keys

      // Try to get from cache - this is a workaround since we don't have pattern matching
      // In a real implementation, you'd want to maintain a separate index of channelId -> intentIds
      try {
        const intent = await this.runtime.getCache<IntentContext>(cacheKey);
        if (intent?.status === "ACTIVE" && intent.channelId === channelId) {
          intents.push(intent);
        }
      } catch (error) {
        // Cache key might not exist, continue
      }
    }

    return intents;
  }

  async getActiveIntentByReply(
    reply: Memory
  ): Promise<IntentContext | undefined> {
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
        return undefined;
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
        return undefined;
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
        return undefined;
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
        return undefined;
      }

      this.runtime.logger.debug("Found agent responses to analyze", {
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
            this.runtime.logger.info(
              "Found active intent from agent responses",
              {
                intentId: intent.id,
                intentType: intent.type,
                domain: intent.domain,
                fromResponseId: messageId,
              }
            );

            return intent;
          }
        }
      }

      logger.debug("No active intents found in agent responses or by domain");
      return undefined;
    } catch (error) {
      this.runtime.logger.error(
        "Error finding active intent from reply:",
        error
      );
      return undefined;
    }
  }

  async getIntentById(intentId: string): Promise<IntentContext | undefined> {
    const cacheKey = `intent_id_${intentId}`;
    const cached = await this.runtime.getCache<IntentContext>(cacheKey);
    return cached;
  }

  async updateIntent(intent: IntentContext, values: Record<string, any>) {
    const returnValues = Object.entries(values).reduce((acc, [k, v]) => {
      if (v) {
        return { ...acc, [k]: v };
      } else if (acc[k]) {
        return acc;
      }

      return { ...acc, [k]: v };
    }, intent.returnData || {});
    const updatedIntent = { ...intent, returnData: returnValues };
    await this.storeIntent(updatedIntent);
    return updatedIntent;
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
    this.runtime.logger.debug(
      `[cancelIntent] Cancelling intent ${intent.id} (${intent.type}) in domain ${intent.domain}`
    );

    // Mark as CANCELLED (not delete) for audit trail
    intent.status = "CANCELLED";
    intent.metadata = {
      ...intent.metadata,
      cancelledAt: Date.now(),
    };
    await this.storeIntent(intent);

    this.runtime.logger.debug(
      `[cancelIntent] Marked intent ${intent.id} as CANCELLED at ${intent.metadata.cancelledAt}`
    );

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
          intentType: undefined,
          confidence: 0,
          reasoning: "No registered intents found for domain",
        };

        await this.runtime.setCache(cacheKey, result);
        return result;
      }

      // Get recent conversation context for better intent detection
      const recentMessages = await this.runtime.getMemories({
        roomId: message.roomId,
        count: 5,
        unique: false,
        tableName: "messages",
      });

      const conversationContext = recentMessages
        .slice(-5) // Last 5 messages
        .map((msg) => {
          // Check if message is from the agent by comparing senderId with agentId
          const raw = (msg.metadata as any)?.raw;
          const senderId = raw?.senderId;
          const isAgent = senderId === this.runtime.agentId;
          return `${isAgent ? "Agent" : "User"}: ${msg.content.text}`;
        })
        .join("\n");

      // Create prompt for LLM analysis
      const intentOptions: IntentOption[] = domainIntents.map((intent) => ({
        type: intent.type,
        description: intent.description || `Intent for ${intent.type}`,
        keywords: intent.keywords,
      }));

      const prompt = createIntentDetectionPrompt(
        message.content.text,
        intentOptions,
        domain,
        conversationContext
      );

      // Use LLM to analyze intent
      const response = await this.runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt,
      });

      const analysis = response as LLMIntentAnalysis;

      // LOG THE ACTUAL LLM RESPONSE
      this.runtime.logger.info(
        `[INTENT-DETECTION] Domain: ${domain}, Message: "${message.content.text}"`
      );
      this.runtime.logger.info(
        `[INTENT-DETECTION] LLM Response: selectedIntent=${analysis.selectedIntent}, confidence=${analysis.confidence}, reasoning="${analysis.reasoning}"`
      );

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
      intentType: undefined,
      confidence: 0,
      reasoning: "No matching intent found",
    };
  }
}
