import { Action, Content } from "@elizaos/core";
import { ETH_NULL_ADDR } from "../constants/eth";

import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import {
  suggestStrategyAmountPrompt,
  suggestStrategyAssetPrompt,
  suggestStrategyContractPrompt,
  suggestStrategyRiskProfilePrompt,
} from "../prompts/strategy";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import {
  STRATEGY_PARAMS_PROVIDER_NAME,
  StrategyParamsProviderData,
} from "../providers/strategy-params";
import { selectProviderState } from "../providers/util";
import { LevvaService } from "../services/levva/class";
import { Suggestion } from "./types";
import { CalldataWithDescription } from "../types/tx";
import { rephrase } from "../util/generate";
import { getPreviousReplyContext } from "../util/action-results";

const description =
  "Select and manage earning strategy for user and ask for lacking parameters to build a transaction.";

export const action: Action = {
  name: LEVVA_ACTIONS.SELECT_STRATEGY,
  description,
  similes: [
    LEVVA_ACTIONS.SELECT_STRATEGY,
    "select strategy",
    "SUGGEST_STRATEGY",
    "suggest strategy",
    "strategy",
    "earning strategy",
    "farming strategy",
  ],

  validate: async () => {
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    // Get previous action context BEFORE try block for error handling
    const prevActions = await getPreviousReplyContext(runtime, message, state);

    // Compose state with required providers
    const composedState = await runtime.composeState(message, [
      STRATEGY_PARAMS_PROVIDER_NAME,
    ]);

    try {
      if (!callback) {
        throw new Error("Callback not found, disable action");
      }

      const lvva = selectProviderState<LevvaProviderState>(
        LEVVA_PROVIDER_NAME,
        composedState
      );

      if (!lvva) {
        throw new Error("Failed to get lvva provider, disable action");
      }

      if (!lvva.user) {
        throw new Error("Failed to get current user, please connect wallet");
      }

      const address = lvva.user.address;

      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service, disable action");
      }

      const params = selectProviderState<StrategyParamsProviderData>(
        STRATEGY_PARAMS_PROVIDER_NAME,
        composedState
      );

      if (!params) {
        throw new Error(
          `Failed to get provider(${STRATEGY_PARAMS_PROVIDER_NAME}) results`
        );
      }

      runtime.logger.debug(
        `Strategy selection, known data: ${JSON.stringify(params)}`
      );

      // Helper function to handle missing parameters
      const handleMissingParameter = async (
        paramName: string,
        text: string,
        thought: string
      ) => {
        const content = {
          text,
          thought,
          actions: ["SELECT_STRATEGY"],
          source: message.content.source,
        };

        const result = await rephrase({
          runtime,
          state: composedState,
          content,
          prevActions,
        });

        await callback(result);

        return {
          text: `Generated text: ${result?.text}`,
          values: {
            success: true,
            responded: true,
            lastReply: result.text,
            lastReplyTime: Date.now(),
            thoughtProcess: result?.thought,
          },
          data: {
            actionName: LEVVA_ACTIONS.SELECT_STRATEGY,
            response: result,
            thought: result?.thought,
            initialReply: content.text,
            initialThought: content.thought,
            messageGenerated: true,
          },
          success: true,
        };
      };

      if (!params.strategy) {
        return await handleMissingParameter(
          "strategy",
          `###Known strategies\n${composedState.values.strategies}\n\nPlease select desired strategy`,
          "Since user didn't choose risk profile, give him summary and display options."
        );
      }

      const strategy = params.strategy;

      if (!params.tokenIn) {
        return await handleMissingParameter(
          "tokenIn",
          `### Strategy: ${composedState.values.strategy}\n### Portfolio\n${composedState.values.portfolio}\n\n${composedState.values.tokenIn}`,
          "Since user didn't choose token, give him summary and display options."
        );
      }

      const tokenIn = params.tokenIn;

      if (!params.amount) {
        return await handleMissingParameter(
          "amount",
          `Strategy: ${composedState.values.strategy}\n\nSelected token: ${composedState.values.tokenIn}\n\nPortfolio: ${composedState.values.portfolio}\n\n${composedState.values.amountIn}`,
          "Since user didn't choose amount, give him summary and display options."
        );
      }

      const amount = params.amount;
      const leverage = params.leverage;
      let calldata: CalldataWithDescription[] | undefined;
      let thought: string | undefined;
      let text: string | undefined;

      if (strategy.type === "pool") {
        calldata = await service.handlePoolStrategy(
          strategy,
          address,
          tokenIn.address ?? ETH_NULL_ADDR,
          amount,
          leverage
        );

        thought = `Prepared transaction to deposit ${amount} ${tokenIn.symbol} to pool ${strategy.contractAddress} with x${leverage} leverage, need to display confirmation`;

        const detailedSteps = calldata
          .map((c, i) => `${i + 1}. ${c.description}`)
          .join("\n");

        text = `Strategy: ${service.formatStrategy(strategy)}\n\nToken: ${service.formatToken(tokenIn)}\n\nAmount: ${amount}\n\nLeverage: x${leverage}\n\n### Transaction steps:\n${detailedSteps}`;
      } else if (strategy.type === "vault") {
        calldata = await service.handleVaultStrategy(
          strategy,
          address,
          amount
          // todo decide when to wrap tokens
        );

        thought = `Prepared transaction to deposit ${amount} ${tokenIn.symbol} to vault ${strategy.contractAddress}, need to display confirmation`;

        const detailedSteps = calldata
          .map((c, i) => `${i + 1}. ${c.description}`)
          .join("\n");

        text = `Strategy: ${service.formatStrategy(strategy)}\n\nToken: ${service.formatToken(tokenIn)}\n\nAmount: ${amount}\n\n### Transaction steps:\n${detailedSteps}`;
      }

      if (!calldata || !thought || !text) {
        throw new Error(
          `Failed to prepare calldata for strategy(${service.formatStrategy(strategy)})`
        );
      }

      const hash = await service.createCalldata(calldata);

      const json = {
        id: "calls.json",
        url: `/api/calldata?hash=${hash}`,
      };

      const content: Content = {
        thought,
        text,
        actions: ["SELECT_STRATEGY"],
        source: message.content.source,
        attachments: [json],
      };

      const responseContent = await rephrase({
        runtime,
        content,
        state: composedState,
        prevActions,
      });
      await callback(responseContent);

      return {
        text: `Generated calldata accessible at ${json.url}, generated text: ${responseContent?.text}`,
        values: {
          success: true,
          responded: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: LEVVA_ACTIONS.SELECT_STRATEGY,
          response: responseContent,
          thought: responseContent?.thought,
          initialReply: content.text,
          initialThought: content.thought,
          messageGenerated: true,
        },
        success: true,
      };
    } catch (error) {
      runtime.logger.error("Error in SELECT_STRATEGY action:", error);
      const errorMessage = (error as Error).message ?? "unknown error";
      const thought = `Action failed with error: ${errorMessage}. I should tell the user about the error.`;
      const text = `Failed to select strategy, reason: ${errorMessage}. Please try again.`;

      const responseContent = await rephrase({
        runtime,
        content: {
          text,
          thought,
          actions: ["SELECT_STRATEGY"],
          source: message.content.source,
        },
        state: composedState,
        prevActions,
      });

      await callback?.(responseContent);

      return {
        text: `Error selecting strategy: ${errorMessage}.`,
        values: {
          success: false,
          responded: true,
          error: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: LEVVA_ACTIONS.SELECT_STRATEGY,
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
          text: "What strategy should I choose?",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: `I don't know which pool to use, please choose from the options below:
{{options}}`,
          actions: ["SELECT_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I choose pool with address {{poolAddress}}",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Thanks you for this. {{poolDescription}}. Leverage is x{{leverage}}. Now please tell me what token to deposit",
          actions: ["SELECT_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I want to deposit {{token}}",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Cool. {{poolDescription}}. Leverage is x{{leverage}}. I don't know how much to deposit, please specify the amount.",
          actions: ["SELECT_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I want to double leverage",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Cool. {{poolDescription}}. Leverage is x{{leverage}}. I don't know how much to deposit, please specify the amount.",
          actions: ["SELECT_STRATEGY"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I want to deposit {{amount}} {{token}}",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Great! {{poolDescription}}. Leverage is x{{leverage}}. Deposit {{amount}} {{token}}. Please sign transactions in your wallet.",
          actions: ["SELECT_STRATEGY"],
        },
      },
    ],
  ],
};

export const suggest: Suggestion[] = [
  {
    name: "strategy-risk-profile",
    description: "First, choose strategy risk profile if no info provided",
    getPrompt: async (runtime, params) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [strategies, assets, availableTokens] = await Promise.all([
        service.getStrategies(params.chainId),
        service.getWalletAssets({
          address: params.address,
          chainId: params.chainId,
        }),
        service.getAvailableTokens({
          chainId: params.chainId,
        }),
      ]);

      return suggestStrategyRiskProfilePrompt({
        strategies: strategies.map(service.formatStrategy).join("\n"),
        decision: params.decision,
        conversation: params.conversation,
        portfolio: service.formatWalletAssets(assets, true),
        availableTokens: availableTokens
          .map((token) => `${token.symbol}(${token.address})`)
          .join(", "),
      });
    },
  },
  {
    name: "strategy-pool",
    description: "Display available pools",
    getPrompt: async (runtime, params) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [strategies, assets, availableTokens] = await Promise.all([
        service.getStrategies(params.chainId).then(async (strategies) => {
          return Promise.all(
            strategies.map(async (strategy) => {
              // fixme implement WHERE ID IN (arr) for cache entries
              const data = await service.getStrategyData(strategy);

              const tokenStr =
                data.type === "pool"
                  ? `Base token: ${data.data.baseToken}, Quote token: ${data.data.quoteToken}`
                  : `Token: ${data.data.asset}`;

              return `${service.formatStrategy(strategy)}. ${tokenStr}`;
            })
          );
        }),
        service.getWalletAssets({
          address: params.address,
          chainId: params.chainId,
        }),
        service.getAvailableTokens({
          chainId: params.chainId,
        }),
      ]);

      return suggestStrategyContractPrompt({
        pools: strategies.join("\n"),
        decision: params.decision,
        conversation: params.conversation,
        portfolio: service.formatWalletAssets(assets, true),
        availableTokens: availableTokens
          .map((token) => `${token.symbol}(${token.address})`)
          .join(", "),
      });
    },
  },
  {
    name: "strategy-asset",
    description: "Display available assets to deposit",
    getPrompt: async (runtime, params) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [strategies, assets, availableTokens] = await Promise.all([
        service.getStrategies(params.chainId).then(async (strategies) => {
          return Promise.all(
            strategies.map(async (strategy) => {
              // fixme implement WHERE ID IN (arr) for cache entries
              const data = await service.getStrategyData(strategy);

              const tokenStr =
                data.type === "pool"
                  ? `Base token: ${data.data.baseToken}, Quote token: ${data.data.quoteToken}`
                  : `Token: ${data.data.asset}`;

              return `${service.formatStrategy(strategy)}. ${tokenStr}`;
            })
          );
        }),
        service.getWalletAssets({
          address: params.address,
          chainId: params.chainId,
        }),
        service.getAvailableTokens({
          chainId: params.chainId,
        }),
      ]);

      return suggestStrategyAssetPrompt({
        pools: strategies.join("\n"),
        decision: params.decision,
        conversation: params.conversation,
        portfolio: service.formatWalletAssets(assets, true),
        availableTokens: availableTokens
          .map((token) => `${token.symbol}(${token.address})`)
          .join(", "),
      });
    },
  },
  {
    name: "strategy-amount",
    description: "Display available amount to deposit",
    getPrompt: async (runtime, params) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [strategies, tokens, portfolio] = await Promise.all([
        service.getStrategies(params.chainId).then(async (strategies) => {
          return Promise.all(
            strategies.map(async (strategy) => {
              // fixme implement WHERE ID IN (arr) for cache entries
              const data = await service.getStrategyData(strategy);

              const tokenStr =
                data.type === "pool"
                  ? `Base token: ${data.data.baseToken}, Quote token: ${data.data.quoteToken}`
                  : `Token: ${data.data.asset}`;

              return `${service.formatStrategy(strategy)}. ${tokenStr}`;
            })
          );
        }),
        service.getAvailableTokens({
          chainId: params.chainId,
        }),
        service.getWalletAssets({
          address: params.address,
          chainId: params.chainId,
        }),
      ]);

      return suggestStrategyAmountPrompt({
        decision: params.decision,
        conversation: params.conversation,
        strategies: strategies.join("\n"),
        portfolio: service.formatWalletAssets(portfolio, true),
        availableTokens: tokens
          .map(
            (token) =>
              `${token.symbol}(${token.address === "0x0000000000000000000000000000000000000000" ? "Native token" : token.address})`
          )
          .join(", "),
      });
    },
  },
];
