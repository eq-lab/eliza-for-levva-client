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
import { handleSwapIntent, generateSwapSuggestions } from "./intents/swap";
import { IntentManager } from "../services/intent-manager";

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
      const composedState = await runtime.composeState(
        message,
        [SWAP_PARAMS_PROVIDER_NAME],
        true
      );

      const providerData = selectProviderState<SwapParamsProviderData>(
        SWAP_PARAMS_PROVIDER_NAME,
        composedState
      );

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
          thought,
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
          thought: responseContent?.thought,
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

// Removed legacy suggestion system - all swap suggestions now handled by intent-aware system
// Old suggestions (exchange-amount, exchange-pairs, swap-continuation) were redundant with
// the progressive disclosure flow in generateSwapSuggestions via swap-intent.ts
export const suggest: Suggestion[] = [];
