import { IAgentRuntime, Memory, State, type Action } from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE, INTENT_TYPE } from "../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import { selectProviderState } from "../providers/util";
import { LevvaService } from "../services/levva/class";
import { rephrase } from "../util/generate";
import { Suggestion } from "./types";
import { getPreviousReplyContext } from "../util/action-results";
import { IntentManager } from "../services/intent-manager";
import {
  PENDLE_PARAMS_PROVIDER_NAME,
  PendleParamsProviderData,
} from "../providers/pendle-params";
import {
  generatePendleStrategySuggestions,
  handlePendleStrategyIntent,
} from "./intents";
import { formatDecimalToPercentage } from "../util";
import { formatCoin } from "../util/format-coin";
import { PendleMarket } from "../api/levva/schema";

const description =
  "Handle Pendle explore, buy, sell, deposit, and withdraw requests using intent-based system with multi-step process support.";

export const action: Action = {
  name: LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY,
  description,
  similes: [
    "SELECT_PENDLE_STRATEGY",
    "buy Pendle PT",
    "purchase Pendle PT",
    "long Pendle PT",
    "invest in Pendle PT",
    "sell Pendle PT",
    "exit Pendle PT",
    "withdraw Pendle PT",
    "remove liquidity from Pendle pool",
    "deposit to Pendle pool",
    "add liquidity to Pendle pool",
    "provide liquidity to Pendle pool",
    "explore Pendle strategies",
  ],

  validate: async () => {
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    try {
      runtime.logger.info(
        "SELECT_PENDLE_STRATEGY action called with composeState pattern"
      );

      // 1. Get required services
      const levvaService = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!levvaService) {
        throw new Error(
          "LevvaService not found - required for Pendle operations"
        );
      }

      // 2. Compose state and get provider data
      const composedState = await runtime.composeState(
        message,
        [PENDLE_PARAMS_PROVIDER_NAME],
        true
      );

      const providerData = selectProviderState<PendleParamsProviderData>(
        PENDLE_PARAMS_PROVIDER_NAME,
        composedState
      );

      if (!providerData) {
        throw new Error(
          `Failed to get provider(${PENDLE_PARAMS_PROVIDER_NAME}) results`
        );
      }

      // 3. Get previous actions context
      const prevActions = await getPreviousReplyContext(
        runtime,
        message,
        composedState
      );

      // 4. Get user info from levva provider
      const levvaProviderState = selectProviderState<LevvaProviderState>(
        LEVVA_PROVIDER_NAME,
        composedState
      );

      if (!levvaProviderState?.user) {
        throw new Error("User address is required");
      }

      const displayPendleMarkets = async (
        runtime: IAgentRuntime,
        message: Memory,
        composedState: State,
        prevActions: string
      ) => {
        let thought: string;
        let text: string;
        let pendleMarkets: PendleMarket[] = [];

        if (
          providerData.pendleFilteredMarkets &&
          providerData.pendleFilteredMarkets.length === 0
        ) {
          pendleMarkets = await levvaService.getPendleMarkets(
            levvaProviderState.chainId
          );

          thought =
            "No Pendle markets found, searched for all markets. I should ask for clarification.";
          text = `✨ Here are the Pendle markets:`;
        } else if (
          providerData.pendleFilteredMarkets &&
          providerData.pendleFilteredMarkets.length > 0
        ) {
          pendleMarkets = providerData.pendleFilteredMarkets;

          thought =
            "Searched for Pendle markets, found some. I should ask for clarification.";
          text = `✨ Here are the filtered Pendle markets:`;
        } else {
          return { content: null, thought: null };
        }

        const formattedPendleMarkets =
          pendleMarkets
            ?.sort((a, b) => b.impliedApy - a.impliedApy)
            .map((market) => {
              const maturityDate = new Date(market.maturityDate)
                .toDateString()
                .slice(4, 15);
              const percentageApy = formatDecimalToPercentage(
                market.impliedApy
              );
              const liquidityInUsd = formatCoin(+market.liquidity.toFixed(2));

              return `\n- ${market.underlyingType} yield **${market.underlyingAssetSymbol} – matures on ${maturityDate}**, Implied APY: ${percentageApy}, PT Liquidity: ~$${liquidityInUsd}`;
            })
            .join("\n") ?? [];

        const responseContent = await rephrase({
          runtime,
          content: {
            text: `${text}${formattedPendleMarkets}`,
            thought,
            actions: [`${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`],
            source: message.content.source,
          },
          state: composedState,
          prevActions,
        });

        await callback!(responseContent);

        return {
          thought,
          content: responseContent,
        };
      };

      // 5. Check if we have intent context from provider
      if (providerData.intentContext) {
        runtime.logger.info("Using intent context from provider", {
          intentId: providerData.intentContext.id,
          type: providerData.intentContext.type,
        });

        await displayPendleMarkets(
          runtime,
          message,
          composedState,
          prevActions
        );

        // Use intent handler with context from provider
        return await handlePendleStrategyIntent(
          runtime,
          message,
          composedState,
          callback!,
          providerData.intentContext,
          prevActions
        );
      }

      // 6. If no intent context but we have Pendle parameters, handle as direct Pendle strategy request
      if (
        providerData.operationType &&
        providerData.tokenInData &&
        providerData.tokenOutData &&
        providerData.amount
      ) {
        runtime.logger.info(
          "Processing direct Pendle strategy request without intent context"
        );

        // Create a minimal intent context for the swap handler
        const intentManager = runtime.getService<IntentManager>(
          LEVVA_SERVICE.INTENT_MANAGER
        );
        if (intentManager) {
          const intentContext = await intentManager.createIntent({
            type: INTENT_TYPE.SELECT_PENDLE_STRATEGY,
            domain: LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY,
            userId: (message as any).userId || "unknown",
            channelId: message.roomId,
            metadata: {
              userAddress: levvaProviderState.user.address,
              chainId: levvaProviderState.chainId,
            },
          });

          return await handlePendleStrategyIntent(
            runtime,
            message,
            composedState,
            callback!,
            intentContext,
            prevActions
          );
        }
      }

      // 7. If no clear Pendle parameters, provide helpful guidance
      const { thought, content } = await displayPendleMarkets(
        runtime,
        message,
        composedState,
        prevActions
      );

      return {
        text: `Generated ${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}: ${content?.text}`,
        values: {
          success: true,
          responded: true,
          lastReply: content?.text,
          lastReplyTime: Date.now(),
          thoughtProcess: content?.thought,
        },
        data: {
          actionName: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
          response: content,
          thought,
          messageGenerated: true,
        },
        success: true,
      };
    } catch (error) {
      runtime.logger.error("Error in SELECT_PENDLE_STRATEGY action:", error);
      const errorMessage = (error as Error).message ?? "unknown error";
      const thought = `Action failed with error: ${errorMessage}. I should tell the user about the error.`;
      const text = `Failed to process Pendle request, reason: ${errorMessage}. Please try again.`;

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
          actions: [`${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`],
          source: message.content.source,
        },
        state: state || ({} as any),
        prevActions,
      });

      await callback?.(responseContent);

      return {
        text: `Error processing Pendle strategy request: ${errorMessage}.`,
        values: {
          success: false,
          responded: true,
          error: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
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
          text: "Buy {{amount}} {{token}} PT with 30-90 days maturity",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "I'll help you purchase {{amount}} {{token}} PT tokens with medium-term maturity. Please confirm the transaction details.",
          action: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Sell my PT-{{token}} tokens",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Which PT-{{token}} position would you like to exit? I can see you have some PT tokens in your wallet.",
          action: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Deposit {{amount}} {{token}} to Pendle pool",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "I'll help you provide liquidity to Pendle. Depositing {{amount}} {{token}}...\nPlease approve the transaction in your wallet.",
          actions: [`${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Withdraw from Pendle",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Which Pendle position would you like to withdraw from? Please specify the token and amount.",
          action: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I want to explore Pendle fixed term, fixed yield till maturity options",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "I'll help you explore Pendle fixed term, fixed yield till maturity options.",
          action: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
        },
      },
    ],
  ],
};

// Register the Pendle strategy intent
IntentManager.registerIntent({
  type: INTENT_TYPE.SELECT_PENDLE_STRATEGY,
  domain: LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY,
  keywords: [
    // General Pendle keywords
    "Pendle",
    "PT token",
    "principal token",
    "Pendle fixed term, fixed yield till maturity",
    "explore Pendle strategies",

    // Buy PT tokens
    "buy Pendle PT",
    "purchase Pendle PT",
    "buy PT tokens",
    "long Pendle",
    "invest in Pendle PT",
    "swap to Pendle PT",
    "get Pendle PT",

    // Sell PT tokens
    "sell Pendle PT",
    "sell PT tokens",
    "exit Pendle position",
    "close Pendle position",
    "convert PT to",

    // Deposit/Provide Liquidity
    "deposit to Pendle",
    "provide liquidity to Pendle",
    "add liquidity Pendle",
    "deposit Pendle pool",
    "LP Pendle",
    "farm on Pendle",

    // Withdraw Liquidity
    "withdraw from Pendle",
    "remove liquidity Pendle",
    "exit Pendle pool",
    "unstake Pendle",
  ],
  handler: handlePendleStrategyIntent,
  generateSuggestions: generatePendleStrategySuggestions,
  description:
    "Handle Pendle buy, sell, deposit, and withdraw requests with multi-step process support",
});

export const suggest: Suggestion[] = [];
