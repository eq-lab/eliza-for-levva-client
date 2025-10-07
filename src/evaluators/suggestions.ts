import { desc, eq } from "drizzle-orm";
import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  ModelType,
  UUID,
  logger,
} from "@elizaos/core";
import { plugin } from "@elizaos/plugin-sql";
import { modules } from "../actions/modules";
import { LEVVA_SERVICE } from "../constants/enum";
import { defaultSuggestionPrompt } from "../prompts/default";
import { LevvaService } from "../services/levva/class";
import { suggestTypeTemplate } from "../templates/generate";
import { formatUnits, isHex } from "viem";
import { hasRawMetadata } from "./utils";
import { IntentManager } from "../services/intent-manager";
import { ETH_NULL_ADDR } from "../constants/eth";

const schema = plugin.schema;

interface MessageEntry {
  authorId: string;
  rawMessage: {
    text?: string;
    message?: string;
    actions: string[];
    thought: string;
    metadata: Record<string, any>;
  };
}

interface Suggestions {
  label: string;
  text: string;
}

const getChainId = (message?: MessageEntry): number | undefined => {
  const value = message?.rawMessage.metadata?.chainId;

  if (typeof value === "number") {
    return value;
  }
};

export const suggestionsEvaluator: Evaluator = {
  name: "SUGGESTIONS_GENERATOR",
  description: "Generate suggestions asynchronously after action completion",
  alwaysRun: false,
  similes: [
    "GENERATE_SUGGESTIONS",
    "CREATE_SUGGESTIONS",
    "SUGGESTION_GENERATOR",
    "suggestions generator",
    "generate suggestions",
  ],
  examples: [],

  validate: async () => {
    return true;
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    let loadingKey: string | undefined;

    try {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        return;
      }

      if (!hasRawMetadata(message.metadata)) {
        return;
      }

      const raw = message.metadata.raw;
      const metadata = raw?.metadata;
      const channelId = raw?.channelId;
      const userAddressId = metadata?.userAddressId;
      const chainId = metadata?.chainId;

      if (!channelId || !userAddressId || !chainId) {
        return;
      }

      const user = await service.getUserById(userAddressId as UUID);
      if (!user) {
        return;
      }
      const userAddress = user.address;

      if (!isHex(userAddress)) {
        return;
      }

      // Set loading state
      loadingKey = `suggestions_loading:${user.address}:${chainId}`;
      // @ts-expect-error - stateCache exists on runtime but not in interface
      runtime.stateCache.set(loadingKey, true);

      const messages = await service.getMessages({
        where: eq(schema.messageTable.channelId, channelId),
        orderBy: desc(schema.messageTable.createdAt),
        limit: 10,
      });

      const recentMessages: (MessageEntry["rawMessage"] & {
        isAgent: boolean;
      })[] = [];

      let actionLookup: string | undefined;

      for (let i = 0; i < messages.length; i++) {
        const messageItem = messages[i];
        const isAgent = messageItem.authorId !== user.id;

        if (!actionLookup) {
          actionLookup = messageItem.rawMessage?.actions?.[0];
        }

        const messageChainId = isAgent
          ? getChainId(messages[i + 1])
          : getChainId(messageItem);

        if (messageChainId && messageChainId !== chainId) {
          continue;
        }

        const rawMessage = messageItem.rawMessage;
        recentMessages.push({ ...rawMessage, isAgent });
      }

      const suggestions = modules.find(
        (m) => m.action.name === actionLookup
      )?.suggest;

      const conversation = recentMessages
        .map((item) => {
          return `${item.isAgent ? "Agent: " : "User: "} ${item.text ?? item.message}`;
        })
        .reverse()
        .join("\n");

      // Check for active intents to provide context-aware suggestions
      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      let activeIntent;
      if (intentManager) {
        try {
          // Check for active intents in all domains
          const domains = ["MANAGE_POSITIONS", "SWAP_TOKENS", "ANALYZE_WALLET"];
          for (const domain of domains) {
            const intent = await intentManager.getActiveIntentByDomain(
              userAddressId,
              channelId,
              domain as any
            );
            if (intent && intent.status === "ACTIVE") {
              activeIntent = intent;
              break;
            }
          }
        } catch (error) {
          logger.debug("Error checking for active intents:", error);
        }
      }

      let result: { suggestions: Suggestions[] } | undefined;

      // If there's an active intent, generate context-aware suggestions
      if (activeIntent) {
        logger.info("Generating intent-aware suggestions", {
          intentType: activeIntent.type,
          domain: activeIntent.domain,
          returnData: activeIntent.returnData,
        });

        result = await generateIntentAwareSuggestions(
          runtime,
          activeIntent,
          conversation
        );
      }

      if (suggestions?.length) {
        const gen = await runtime.useModel(ModelType.OBJECT_LARGE, {
          prompt: suggestTypeTemplate(
            suggestions.map(({ name, description }) => ({
              name,
              description,
            }))
          )
            .replace("{{userData}}", JSON.stringify(user))
            .replace("{{conversation}}", conversation),
        });

        const type = gen.type;
        const suggest = suggestions?.find((s) => s.name === type);

        if (suggest) {
          const model = suggest.model ?? ModelType.OBJECT_SMALL;

          const prompt = await suggest.getPrompt(runtime, {
            address: userAddress,
            chainId,
            conversation,
            decision: gen,
          });

          result = await runtime.useModel(model, {
            prompt,
          });
        }
      }

      if (!result) {
        result = await runtime.useModel(ModelType.OBJECT_SMALL, {
          prompt: defaultSuggestionPrompt({ conversation }),
        });
      }

      await runtime.setCache(`suggestions:${user.address}:${chainId}`, {
        value: result?.suggestions ?? [],
      });

      // Clear loading state
      // @ts-expect-error - stateCache exists on runtime but not in interface
      runtime.stateCache.delete(loadingKey);
    } catch (error) {
      logger.error("Error in suggestions evaluator:", error);

      // Clear loading state on error too
      if (loadingKey) {
        // @ts-expect-error - stateCache exists on runtime but not in interface
        runtime.stateCache.delete(loadingKey);
      }
    }
  },
};

async function generateIntentAwareSuggestions(
  runtime: IAgentRuntime,
  activeIntent: any,
  conversation: string
): Promise<{ suggestions: Suggestions[] } | undefined> {
  try {
    const { type, returnData } = activeIntent;

    // Get user data for portfolio-based suggestions
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );
    if (!service) return undefined;

    // Extract user info from conversation or intent context
    let userAddress: `0x${string}` | undefined;
    let chainId: number = 1; // Default to mainnet

    // Try to extract user info from recent messages or intent context
    try {
      // Get recent messages to find user metadata
      const recentMessages = await runtime.getMemories({
        roomId: activeIntent.channelId || "unknown",
        count: 3,
        unique: false,
        tableName: "messages",
      });

      for (const msg of recentMessages) {
        const metadata = (msg as any)?.metadata?.raw?.metadata;
        if (metadata?.userAddressId && metadata?.chainId) {
          const user = await service.getUserById(metadata.userAddressId);
          if (user?.address) {
            userAddress = user.address as `0x${string}`;
            chainId = metadata.chainId;
            break;
          }
        }
      }
    } catch (error) {
      logger.debug("Could not extract user info for suggestions:", error);
    }

    // Generate context-aware suggestions based on intent type and current state
    let contextPrompt = "";

    // Generate intent-aware suggestions if active intent exists
    if (userAddress && activeIntent) {
      try {
        const intentManager = runtime.getService<IntentManager>(
          LEVVA_SERVICE.INTENT_MANAGER
        );

        if (intentManager) {
          const prompt = await intentManager.generateIntentSuggestions({
            intentContext: activeIntent,
            conversation,
            userAddress,
            chainId,
          });

          if (prompt) {
            const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
              prompt,
            });
            return result;
          }
        }
      } catch (error) {
        logger.error("Error generating intent-aware suggestions:", error);
        // Fall through to action-based suggestions
      }
    }

    // No active intent - return undefined to use action-based suggestions
    // Action-based suggestions help users initiate intents (MANAGE_POSITIONS, SWAP_TOKENS, etc.)
    return undefined;
  } catch (error) {
    logger.error("Error generating intent-aware suggestions:", error);
    return undefined;
  }
}

/*
 * LEGACY CODE REMOVED (Phase 6 Cleanup - 2025-01-XX)
 * 
 * The following intent-specific suggestion logic has been removed and replaced
 * with intent-aware suggestion generators co-located with each intent handler:
 * 
 * - DEPOSIT intent suggestions → src/prompts/suggest/deposit-intent.ts
 * - WITHDRAW intent suggestions → src/prompts/suggest/withdraw-intent.ts
 * - SWAP intent suggestions → src/prompts/suggest/swap-intent.ts
 * - SEND intent suggestions → src/prompts/suggest/send-intent.ts
 * 
 * These new generators provide:
 * - Progressive disclosure (only ask for missing parameters)
 * - Context-aware suggestions (based on intent state)
 * - Intent management options (cancel, child intents)
 * - Co-location with intent handlers for better maintainability
 * 
 * When no active intent exists, the evaluator falls through to action-based
 * suggestions which help users initiate new intents.
 */

/**
 * REMOVED LEGACY CODE (~200 lines) - Phase 6 Cleanup
 * 
 * All intent-specific suggestion logic has been migrated to co-located generators:
 * - DEPOSIT: src/prompts/suggest/deposit-intent.ts
 * - SWAP: src/prompts/suggest/swap-intent.ts  
 * - SEND: src/prompts/suggest/send-intent.ts
 * - WITHDRAW: src/prompts/suggest/withdraw-intent.ts
 * 
 * These provide progressive disclosure, context-awareness, and intent management
 * (cancel, child intents) in a maintainable, type-safe architecture.
 */
