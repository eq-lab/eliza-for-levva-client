import { Action, Content } from "@elizaos/core";

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
import { rephrase } from "../util/generate";
import { getPreviousReplyContext } from "../util/action-results";
import { ETH_NULL_ADDR } from "../constants/eth";

const description =
  "Provide investment strategy recommendations and suggestions. Transaction creation is handled by the DEPOSIT intent in MANAGE_POSITIONS domain.";

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

      // User address available for future use
      // const address = lvva.user.address;

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

      // Since parameter extraction is now handled by the deposit intent,
      // this action focuses on providing strategy recommendations and guidance
      const thought = `User is asking about investment strategies. I should provide comprehensive strategy information and guide them to use the deposit intent for actual transactions.`;

      let text = `### Investment Strategy Recommendations\n\n`;
      text += `**Available Strategies:** ${params.strategies.length} strategies across different risk profiles\n\n`;
      text += `**Your Portfolio:**\n${params.portfolioText}\n\n`;
      text += `**Available Strategies:**\n${params.strategiesText}\n\n`;

      text += `### How to Invest\n\n`;
      text += `To invest in any of these strategies, simply tell me:\n`;
      text += `- "I want to deposit [amount] [token] into [strategy name]"\n`;
      text += `- "I want to invest in ultra-safe strategy"\n`;
      text += `- "Deposit 100 USDC into safe strategy"\n\n`;

      text += `I'll help you with the complete investment process, including:\n`;
      text += `- Strategy selection and validation\n`;
      text += `- Token compatibility and conversion (ETH ↔ WETH)\n`;
      text += `- Amount validation and balance checking\n`;
      text += `- Transaction preparation and execution\n\n`;

      text += `**Need help choosing?** Ask me about specific risk levels or strategy types!`;

      const content: Content = {
        thought,
        text,
        actions: ["SELECT_STRATEGY"],
        source: message.content.source,
      };

      const responseContent = await rephrase({
        runtime,
        content,
        state: composedState,
        prevActions,
      });
      await callback(responseContent);

      return {
        text: "Strategy recommendations provided successfully",
        values: {
          success: true,
          responded: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: LEVVA_ACTIONS.SELECT_STRATEGY,
          recommendation: true,
          strategiesCount: params.strategies.length,
          guidanceProvided: true,
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
        service.strategy.getStrategies(params.chainId),
        service.getWalletAssets({
          address: params.address,
          chainId: params.chainId,
        }),
        service.getAvailableTokens({
          chainId: params.chainId,
        }),
      ]);

      return suggestStrategyRiskProfilePrompt({
        strategies: strategies
          .map((s) => service.strategy.formatStrategy(s))
          .join("\n"),
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
        service.strategy
          .getStrategies(params.chainId)
          .then(async (strategies) => {
            return Promise.all(
              strategies.map(async (strategy) => {
                // fixme implement WHERE ID IN (arr) for cache entries
                const data = await service.strategy.getStrategyData(strategy);

                const tokenStr =
                  data.type === "pool"
                    ? `Base token: ${data.data.baseToken}, Quote token: ${data.data.quoteToken}`
                    : `Token: ${data.data.asset}`;

                return `${service.strategy.formatStrategy(strategy)}. ${tokenStr}`;
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
        service.strategy
          .getStrategies(params.chainId)
          .then(async (strategies) => {
            return Promise.all(
              strategies.map(async (strategy) => {
                // fixme implement WHERE ID IN (arr) for cache entries
                const data = await service.strategy.getStrategyData(strategy);

                const tokenStr =
                  data.type === "pool"
                    ? `Base token: ${data.data.baseToken}, Quote token: ${data.data.quoteToken}`
                    : `Token: ${data.data.asset}`;

                return `${service.strategy.formatStrategy(strategy)}. ${tokenStr}`;
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

      // Check for ETH in portfolio for WETH conversion awareness
      const ethBalance = assets.find(
        (asset) =>
          asset.token === ETH_NULL_ADDR || asset.address === ETH_NULL_ADDR
      );

      const hasEth = ethBalance && ethBalance.amount > 0n;
      const ethConversionNote = hasEth
        ? `\n\nNOTE: User has ETH available. ETH can be wrapped to WETH for DeFi strategies that require WETH. Suggest both ETH and WETH options when relevant.`
        : "";

      return suggestStrategyAssetPrompt({
        pools: strategies.join("\n"),
        decision: params.decision,
        conversation: params.conversation,
        portfolio: service.formatWalletAssets(assets, true) + ethConversionNote,
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
        service.strategy
          .getStrategies(params.chainId)
          .then(async (strategies) => {
            return Promise.all(
              strategies.map(async (strategy) => {
                // fixme implement WHERE ID IN (arr) for cache entries
                const data = await service.strategy.getStrategyData(strategy);

                const tokenStr =
                  data.type === "pool"
                    ? `Base token: ${data.data.baseToken}, Quote token: ${data.data.quoteToken}`
                    : `Token: ${data.data.asset}`;

                return `${service.strategy.formatStrategy(strategy)}. ${tokenStr}`;
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

      // Check for ETH in portfolio for WETH conversion awareness
      const ethBalance = portfolio.find(
        (asset) =>
          asset.token === ETH_NULL_ADDR || asset.address === ETH_NULL_ADDR
      );

      const hasEth = ethBalance && ethBalance.amount > 0n;
      const ethConversionNote = hasEth
        ? `\n\nNOTE: User has ETH available. ETH can be wrapped to WETH (1:1 ratio) for strategies requiring WETH. Consider both ETH and WETH amounts when suggesting deposit amounts.`
        : "";

      return suggestStrategyAmountPrompt({
        decision: params.decision,
        conversation: params.conversation,
        strategies: strategies.join("\n"),
        portfolio:
          service.formatWalletAssets(portfolio, true) + ethConversionNote,
        availableTokens: tokens
          .map(
            (token) =>
              `${token.symbol}(${token.address === ETH_NULL_ADDR ? "Native token" : token.address})`
          )
          .join(", "),
      });
    },
  },
];
