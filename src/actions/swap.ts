import { type Action } from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE, INTENT_TYPE } from "../constants/enum";
import {
  SWAP_PARAMS_PROVIDER_NAME,
  SwapParamsProviderData,
} from "../providers/swap-params";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import { selectProviderState } from "../providers/util";
import { LevvaService } from "../services/levva/class";
import { rephrase } from "../util/generate";
import { Suggestion } from "./types";
import { getPreviousReplyContext } from "../util/action-results";
import { exchangeAmountPrompt } from "../prompts/suggest/exchange-amount";
import { exchangePairsPrompt } from "../prompts/suggest/exchange-pairs";
import { IntentManager } from "../services/intent-manager";
import { handleSwapIntent, generateSwapSuggestions } from "./intents/swap";
import { RawMessage } from "../types/core";

const description =
  "Handle token swap requests using intent-based system with multi-step process support including Kyber swaps and ETH wrapping/unwrapping.";

export const action: Action = {
  name: LEVVA_ACTIONS.SWAP_TOKENS,
  description,
  similes: [
    "SWAP_TOKENS",
    "EXCHANGE_TOKENS",
    "SWAP_ASSETS",
    "EXCHANGE_ASSETS",
    "swap tokens",
    "exchange tokens",
    "swap",
    "exchange",
    "exchange assets",
    "swap assets",
  ],

  validate: async () => {
    // fixme validations run in ACTIONS provider on 1st runtime.composeState call
    // runtime.composeState gets all providers in Promise.all, so provider position does not seem to matter
    // consider implementing composeState sequentially, or calling compose state in validator(seems unreliable)
    // so for now decide to always include
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    try {
      runtime.logger.info(
        "SWAP_TOKENS action called with composeState pattern"
      );

      // 1. Get required services
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) {
        throw new Error(
          "LevvaService not found - required for swap operations"
        );
      }

      // 2. Compose state and get provider data
      const composedState = await runtime.composeState(message, [
        SWAP_PARAMS_PROVIDER_NAME,
      ]);

      const providerResult =
        composedState.data?.providers?.[SWAP_PARAMS_PROVIDER_NAME];
      const providerData = providerResult?.data as SwapParamsProviderData;

      if (!providerData) {
        throw new Error(
          `Failed to get provider(${SWAP_PARAMS_PROVIDER_NAME}) results`
        );
      }

      // 3. Get previous actions context
      const prevActions = await getPreviousReplyContext(
        runtime,
        message,
        composedState
      );

      // 4. Get user info from lvva provider
      const lvva = selectProviderState<LevvaProviderState>(
        LEVVA_PROVIDER_NAME,
        composedState
      );

      if (!lvva?.user) {
        throw new Error("User address is required");
      }

      // 5. Check if we have intent context from provider
      if (providerData.intentContext) {
        runtime.logger.info("Using intent context from provider", {
          intentId: providerData.intentContext.id,
          type: providerData.intentContext.type,
        });

        // Use intent handler with context from provider
        return await handleSwapIntent(
          runtime,
          message,
          composedState,
          callback!,
          providerData.intentContext,
          prevActions
        );
      }

      // 6. If no intent context but we have swap parameters, handle as direct swap request
      if (
        providerData.type &&
        providerData.tokenIn &&
        providerData.tokenOut &&
        providerData.amount
      ) {
        runtime.logger.info(
          "Processing direct swap request without intent context"
        );

        // Create a minimal intent context for the swap handler
        const intentManager = runtime.getService<IntentManager>(
          LEVVA_SERVICE.INTENT_MANAGER
        );
        if (intentManager) {
          const intentContext = await intentManager.createIntent({
            type: INTENT_TYPE.SWAP,
            domain: LEVVA_ACTIONS.SWAP_TOKENS,
            userId: (message as any).userId || "unknown",
            channelId: message.roomId,
            metadata: {
              userAddress: lvva.user.address,
              chainId: lvva.chainId,
              directSwap: true,
            },
          });

          return await handleSwapIntent(
            runtime,
            message,
            composedState,
            callback!,
            intentContext,
            prevActions
          );
        }
      }

      // 7. If no clear swap parameters, provide helpful guidance
      const thought =
        "User message doesn't contain clear swap parameters. I should ask for clarification.";
      const text =
        "I'd be happy to help you swap tokens! Please specify which tokens you'd like to swap and the amount. For example: 'Swap 100 USDC to ETH' or 'Exchange 0.5 ETH for USDT'.";

      const responseContent = await rephrase({
        runtime,
        content: {
          text,
          thought,
          actions: ["SWAP_TOKENS"],
          source: message.content.source,
        },
        state: composedState,
        prevActions,
      });

      await callback!(responseContent);

      return {
        text: `Generated ${LEVVA_ACTIONS.SWAP_TOKENS}: ${responseContent?.text}`,
        values: {
          success: true,
          responded: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: LEVVA_ACTIONS.SWAP_TOKENS,
          response: responseContent,
          messageGenerated: true,
        },
        success: true,
      };
    } catch (error) {
      runtime.logger.error("Error in SWAP_TOKENS action:", error);
      const errorMessage = (error as Error).message ?? "unknown error";
      const thought = `Action failed with error: ${errorMessage}. I should tell the user about the error.`;
      const text = `Failed to process swap request, reason: ${errorMessage}. Please try again.`;

      // Get previous actions context for error handling
      const prevActions = await getPreviousReplyContext(
        runtime,
        message,
        state
      );

      const responseContent = await rephrase({
        runtime,
        content: {
          text,
          thought,
          actions: ["SWAP_TOKENS"],
          source: message.content.source,
        },
        state: state || ({} as any),
        prevActions,
      });

      await callback?.(responseContent);

      return {
        text: `Error processing swap request: ${errorMessage}.`,
        values: {
          success: false,
          responded: true,
          error: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: LEVVA_ACTIONS.SWAP_TOKENS,
          error: errorMessage,
        },
        success: false,
        error: error as Error,
      };
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Please swap {{amount}} {{token1}} to {{token2}}",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Please confirm swap for {{amount}} {{token1}} for {{token2}}",
          action: "SWAP_TOKENS",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Swap tokens",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "What tokens do you want to swap?",
          action: "SWAP_TOKENS",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Token address is {{address}}",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Swapping {{amount}} {{token1}} to {{token2}}...\nPlease approve transactions in your wallet.",
          actions: ["SWAP_TOKENS"],
        },
      },
    ],
  ],
};

// Register the swap intent
IntentManager.registerIntent({
  type: INTENT_TYPE.SWAP,
  domain: LEVVA_ACTIONS.SWAP_TOKENS,
  keywords: [
    "swap",
    "exchange",
    "trade",
    "convert",
    "change",
    "swap tokens",
    "exchange tokens",
    "trade tokens",
    "convert tokens",
    "wrap",
    "unwrap",
    "bridge",
  ],
  handler: handleSwapIntent,
  generateSuggestions: generateSwapSuggestions,
  description:
    "Handle token swap requests with multi-step process support including Kyber swaps and ETH wrapping/unwrapping",
});

export const suggest: Suggestion[] = [
  {
    name: "exchange-amount",
    description:
      "Use if user wants to swap tokens, and the agent knows what token to swap but the amount is not specified, suggest how much to swap based on user's portfolio and active intent context",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision },
      message?
    ) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) {
        throw new Error("Failed to get levva service");
      }

      // Get intent context for enhanced suggestions when message is available
      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      let intentContext;
      let swapParams;

      if (intentManager && message) {
        try {
          // Extract user info for intent management
          const raw = (message.metadata as unknown as { raw: RawMessage }).raw;
          const userId = raw?.senderId || "unknown";
          const channelId = raw?.channelId || message.roomId;

          // Check for active swap intent
          intentContext = await intentManager.getActiveIntentByDomain(
            userId,
            channelId,
            LEVVA_ACTIONS.SWAP_TOKENS
          );

          // Get swap parameters from provider if available
          if (intentContext) {
            try {
              const composedState = await runtime.composeState(message, [
                SWAP_PARAMS_PROVIDER_NAME,
              ]);
              swapParams =
                composedState.data?.providers?.[SWAP_PARAMS_PROVIDER_NAME]
                  ?.data;
            } catch (error) {
              runtime.logger.warn(
                "Failed to get swap params for suggestions:",
                error
              );
            }
          }
        } catch (error) {
          runtime.logger.warn(
            "Failed to get intent context for suggestions:",
            error
          );
        }
      }

      const assets = await service.getWalletAssets({ address, chainId });
      const available = await service.getAvailableTokens({ chainId });

      // Enhanced suggestions with intent context when available
      return exchangeAmountPrompt({
        conversation,
        decision,
        walletAssetsFormatted: service.wallet.formatWalletAssets(assets, true),
        availableTokens: available,
        intentContext,
        swapParams,
      });
    },
  },
  {
    name: "exchange-pairs",
    description:
      "Use if the user wants to swap tokens, and the agent does not know which ones, suggest preferred exchange pairs based on portfolio and intent history",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision },
      message?
    ) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) {
        throw new Error("Failed to get levva service");
      }

      // Get intent context for enhanced suggestions when message is available
      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      let intentContext;
      let recentIntents: any[] = [];

      if (intentManager && message) {
        try {
          // Extract user info for intent management
          const raw = (message.metadata as unknown as { raw: RawMessage }).raw;
          const userId = raw?.senderId || "unknown";
          const channelId = raw?.channelId || message.roomId;

          // Check for active swap intent
          intentContext = await intentManager.getActiveIntentByDomain(
            userId,
            channelId,
            LEVVA_ACTIONS.SWAP_TOKENS
          );

          // Get recent swap intents for better suggestions
          // Note: This would require a method to get intents by user
          // For now, we'll work with just the active intent
          if (intentContext) {
            recentIntents = [intentContext];
          }
        } catch (error) {
          runtime.logger.warn(
            "Failed to get intent context for suggestions:",
            error
          );
        }
      }

      const assets = await service.getWalletAssets({ address, chainId });
      const available = await service.getAvailableTokens({ chainId });

      // Enhanced suggestions with intent context when available
      return exchangePairsPrompt({
        conversation,
        decision,
        walletAssetsFormatted: service.wallet.formatWalletAssets(assets, true),
        availableTokens: available,
        intentContext,
        recentIntents,
      });
    },
  },
  {
    name: "swap-continuation",
    description:
      "Use when there's an active swap intent that needs continuation or completion, suggest next steps based on intent state",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision: _decision },
      message?
    ) => {
      if (!message) {
        return "No message context available for swap continuation suggestions.";
      }

      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      if (!intentManager) {
        return "Intent manager not available for swap continuation suggestions.";
      }

      // Extract user info for intent management
      const raw = (message.metadata as unknown as { raw: RawMessage }).raw;
      const userId = raw?.senderId || "unknown";
      const channelId = raw?.channelId || message.roomId;

      // Get active swap intent
      const intentContext = await intentManager.getActiveIntentByDomain(
        userId,
        channelId,
        LEVVA_ACTIONS.SWAP_TOKENS
      );

      if (!intentContext) {
        return "No active swap intent found for continuation suggestions.";
      }

      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) {
        throw new Error("Failed to get levva service");
      }

      // Get current swap parameters
      let swapParams;
      try {
        const composedState = await runtime.composeState(message, [
          SWAP_PARAMS_PROVIDER_NAME,
        ]);
        swapParams =
          composedState.data?.providers?.[SWAP_PARAMS_PROVIDER_NAME]?.data;
      } catch (error) {
        runtime.logger.warn(
          "Failed to get swap params for continuation:",
          error
        );
      }

      const assets = await service.getWalletAssets({ address, chainId });

      return `<task>Generate suggestions for continuing an active swap intent</task>
<intentContext>
Intent ID: ${intentContext.id}
Intent Type: ${intentContext.type}
Intent Status: ${intentContext.status}
Intent Data: ${JSON.stringify(intentContext.returnData || {})}
Created: ${intentContext.createdAt}
Memories: ${intentContext.memories?.length || 0} messages
</intentContext>
<swapParams>
${swapParams ? JSON.stringify(swapParams) : "No swap parameters available"}
</swapParams>
<portfolio>
${service.wallet.formatWalletAssets(assets, true)}
</portfolio>
<conversation>
${conversation}
</conversation>
<instructions>
Based on the active intent context and current parameters, generate 3-4 suggestions for continuing the swap process:

1. **Missing Token Information**: If tokens aren't specified, suggest specific token pairs from portfolio
2. **Missing Amount**: If amount isn't specified, suggest percentage-based amounts (10%, 25%, 50%, 95%)
3. **Complete Parameters**: If all parameters are available, suggest proceeding with the swap
4. **Issues/Alternatives**: If there are problems (insufficient balance, etc.), suggest alternatives

**Smart Suggestions:**
- Prioritize tokens with sufficient balances
- Consider gas costs (suggest 95% not 100% for native tokens)
- Use intent memory context to understand user preferences
- Suggest realistic amounts based on portfolio

Each suggestion should help move the intent forward toward completion.
</instructions>
<output>
{
  "thought": "Analysis of current intent state and next steps needed",
  "suggestions": [
    {
      "label": "Short descriptive label",
      "text": "Natural user message to continue the intent"
    }
  ]
}
</output>`;
    },
  },
];
