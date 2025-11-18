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
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import { defaultSuggestionPrompt } from "../prompts/suggest/default";
import {
  defaultSuggestionSchema,
  suggestionTypeSchema,
} from "../prompts/suggest/schema";
import { zodJsonSchema } from "../prompts/util";
import { LevvaService } from "../services/levva/class";
import { suggestTypeTemplate } from "../templates/generate";
import { isHex } from "viem";
import { hasRawMetadata } from "./utils";
import { IntentManager } from "../services/intent-manager";

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
      loadingKey = `suggestions_loading:${user.address}:${chainId}:${channelId}`;
      // @ts-expect-error - stateCache exists on runtime but not in interface
      await runtime.stateCache.set(loadingKey, true);

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
          // CRITICAL FIX: Check the action's domain FIRST, then check all other domains
          // This ensures we prioritize the current action's intents over stale intents from other domains

          logger.info(`[SUGGESTIONS] Action lookup: "${actionLookup}"`);

          // First priority: Check domain matching the current action
          if (actionLookup) {
            const intent = await intentManager.getActiveIntentByDomain(
              userAddressId,
              channelId,
              actionLookup as any
            );

            if (intent && intent.status === "ACTIVE") {
              activeIntent = intent;
              logger.info(
                `[SUGGESTIONS] ✅ Found active intent in primary domain: ${intent.type} in ${intent.domain}`
              );
            }
          }

          // Second priority: If no intent in primary domain, check other domains
          // This handles cases where intent might be in a different domain (edge case)
          if (!activeIntent) {
            const allDomains = [
              `${LEVVA_ACTIONS.MANAGE_POSITIONS}`,
              `${LEVVA_ACTIONS.SWAP_TOKENS}`,
              `${LEVVA_ACTIONS.ANALYZE_WALLET}`,
              `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
            ];
            const domainsToCheck = actionLookup
              ? allDomains.filter((d) => d !== actionLookup)
              : allDomains;

            logger.info(
              `[SUGGESTIONS] No intent in primary domain, checking fallback domains: ${domainsToCheck.join(", ")}`
            );

            for (const domain of domainsToCheck) {
              const intent = await intentManager.getActiveIntentByDomain(
                userAddressId,
                channelId,
                domain as any
              );

              if (intent && intent.status === "ACTIVE") {
                activeIntent = intent;
                logger.warn(
                  `[SUGGESTIONS] ⚠️ Found active intent in FALLBACK domain (may be stale): ${intent.type} in ${intent.domain} (current action: ${actionLookup})`
                );
                break;
              }
            }
          }

          if (!activeIntent) {
            logger.info(
              `[SUGGESTIONS] ❌ No active intent found in any domain`
            );
          }
        } catch (error) {
          runtime.logger.error("Error checking for active intents:", error);
        }
      } else {
        logger.warn("[SUGGESTIONS] IntentManager not available");
      }

      let result: { suggestions: Suggestions[] } | undefined;

      // If there's an active intent, generate context-aware suggestions
      if (activeIntent) {
        logger.info(
          `[SUGGESTIONS] 🎯 Generating intent-aware suggestions for ${activeIntent.type} intent`
        );

        try {
          result = await generateIntentAwareSuggestions(
            runtime,
            activeIntent,
            conversation,
            userAddress as `0x${string}`, // Pass userAddress from outer scope
            chainId // Pass chainId from outer scope
          );

          if (result) {
            logger.info(
              `[SUGGESTIONS] ✅ Generated ${result.suggestions?.length || 0} intent-aware suggestions`
            );
          } else {
            logger.warn(
              `[SUGGESTIONS] ⚠️ Intent-aware suggestion generator returned undefined`
            );
          }
        } catch (error) {
          logger.error(
            `[SUGGESTIONS] ❌ Failed to generate intent-aware suggestions: ${(error as Error)?.message}`
          );
          // Fall through to action-based or default suggestions
        }
      }

      // Only use action-based suggestions if intent-aware suggestions weren't generated
      if (!result && suggestions?.length) {
        logger.info(
          "[SUGGESTIONS] No intent-aware suggestions, falling back to action-based suggestions"
        );

        const gen = await runtime.useModel(ModelType.OBJECT_SMALL, {
          prompt: suggestTypeTemplate(
            suggestions.map(({ name, description }) => ({
              name,
              description,
            }))
          )
            .replace("{{userData}}", JSON.stringify(user))
            .replace("{{conversation}}", conversation),
          schema: zodJsonSchema(suggestionTypeSchema),
          temperature: 0,
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
            schema: zodJsonSchema(defaultSuggestionSchema),
            temperature: 0,
          });
        }
      } else if (result) {
        logger.info(
          "[SUGGESTIONS] Using intent-aware suggestions, skipping action-based suggestions"
        );
      }

      if (!result) {
        logger.debug("Using default suggestions");
        result = await runtime.useModel(ModelType.OBJECT_SMALL, {
          prompt: defaultSuggestionPrompt({ conversation }),
          schema: zodJsonSchema(defaultSuggestionSchema),
          temperature: 0,
        });
      }

      await runtime.setCache(
        `suggestions:${user.address}:${chainId}:${channelId}`,
        {
          value: result?.suggestions ?? [],
        }
      );

      // Clear loading state
      // @ts-expect-error - stateCache exists on runtime but not in interface
      await runtime.stateCache.delete(loadingKey);
    } catch (error) {
      runtime.logger.error("Error in suggestions evaluator:", error);

      // Clear loading state on error too
      if (loadingKey) {
        // @ts-expect-error - stateCache exists on runtime but not in interface
        await runtime.stateCache.delete(loadingKey);
      }
    }
  },
};

async function generateIntentAwareSuggestions(
  runtime: IAgentRuntime,
  activeIntent: any,
  conversation: string,
  userAddress: `0x${string}`,
  chainId: number
): Promise<{ suggestions: Suggestions[] } | undefined> {
  try {
    // Get user data for portfolio-based suggestions
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );
    if (!service) return undefined;

    // Generate intent-aware suggestions using the IntentManager
    try {
      logger.info(
        `[SUGGESTIONS-GEN] Generating suggestions for intent type: ${activeIntent.type}, userAddress: ${userAddress}, chainId: ${chainId}`
      );

      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      if (intentManager) {
        logger.info(
          `[SUGGESTIONS-GEN] Calling intentManager.generateIntentSuggestions`
        );

        const prompt = await intentManager.generateIntentSuggestions({
          intentContext: activeIntent,
          conversation,
          userAddress,
          chainId,
        });

        if (prompt) {
          logger.info(
            `[SUGGESTIONS-GEN] Got prompt (length: ${prompt.length}), calling LLM`
          );
          const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
            prompt,
            schema: zodJsonSchema(defaultSuggestionSchema),
            temperature: 0,
          });
          logger.info(
            `[SUGGESTIONS-GEN] LLM returned ${result?.suggestions?.length || 0} suggestions`
          );
          return result;
        } else {
          logger.warn(
            `[SUGGESTIONS-GEN] No prompt returned from generateIntentSuggestions`
          );
        }
      } else {
        logger.warn(`[SUGGESTIONS-GEN] IntentManager not found`);
      }
    } catch (error) {
      runtime.logger.error("Error generating intent-aware suggestions:", error);
    }

    // No active intent - return undefined to use action-based suggestions
    // Action-based suggestions help users initiate intents (MANAGE_POSITIONS, SWAP_TOKENS, etc.)
    return undefined;
  } catch (error) {
    runtime.logger.error("Error generating intent-aware suggestions:", error);
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
