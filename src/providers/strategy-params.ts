import { ModelType, Provider } from "@elizaos/core";
import { EMPTY_RESULT, selectProviderState } from "./util";
import { LEVVA_SERVICE } from "../constants/enum";
import { ETH_NULL_ADDR } from "../constants/eth";
import { LevvaService } from "../services/levva/class";
import { Strategy } from "../services/levva/pool";
import {
  selectStrategyDataFromMessagesPrompt,
  ExtractedDataForStrategy as ExtractedStrategyParams,
} from "../prompts/strategy";
import { TokenDataWithInfo } from "../types/token";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from ".";
import { parseUnits } from "viem";

/** @deprecated better typing */
type Strategies = Awaited<ReturnType<LevvaService["getStrategies"]>>;
/** @deprecated better typing */
type StrategyData = Awaited<ReturnType<LevvaService["getStrategyData"]>>;
/** @deprecated better typing */
type Portfolio = Awaited<ReturnType<LevvaService["getWalletAssets"]>>;

export interface StrategyParamsProviderData {
  strategies?: Strategies;
  riskProfile?: Strategy; // called type in API
  contract?: `0x${string}`;
  strategy?: Strategies[number];
  tokenIn?: TokenDataWithInfo;
  amount?: string;
  // fixme make up solution for custom parameters
  leverage?: number;
}
export const STRATEGY_PARAMS_PROVIDER_NAME = "STRATEGY_PARAMS";

export const strategyParamsProvider: Provider = {
  name: STRATEGY_PARAMS_PROVIDER_NAME,
  description:
    "Parameters for earning strategy. Enable this provider if user wants to select a strategy or manage current position.",
  dynamic: true,
  async get(runtime, message, state) {
    const service = await runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      return {
        ...EMPTY_RESULT,
        text: `Service "${LEVVA_SERVICE.LEVVA_COMMON}" not found. Unable to get strategy params.`,
      };
    }

    const lvva = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      state
    );

    if (!lvva?.user) {
      return {
        ...EMPTY_RESULT,
        text: `User address not found. Unable to get strategy params.`,
      };
    }

    const { user, chainId } = lvva;

    const [strategies, portfolio] = await Promise.all([
      service.getStrategies(chainId),
      service.getWalletAssets({
        address: user.address,
        chainId,
      }),
    ]);

    let strategiesText = strategies.map(service.formatStrategy).join("\n");
    const portfolioText = service.formatWalletAssets(portfolio);
    const data: StrategyParamsProviderData = { strategies };

    const params = await runtime.useModel(ModelType.OBJECT_SMALL, {
      prompt: selectStrategyDataFromMessagesPrompt({
        recentMessages: state.values.recentMessages,
        pools: strategies.map(service.formatStrategy).join("\n"),
        knownTokens: state.values.tokens,
        portfolio: service.formatWalletAssets(portfolio),
      }),
    });

    runtime.logger.debug(
      `Strategy selection, known data: ${JSON.stringify(params)}`
    );

    if (typeof params !== "object") {
      return {
        ...EMPTY_RESULT,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategy: "No user data for strategy selection",
        },
        text: `Failed to extract strategy parameters: ask user for details`,
      };
    }

    const { strategy, contract, token, amount, leverage } = params;

    if (!strategy) {
      return {
        ...EMPTY_RESULT,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategy: "Unknown risk profile, ask user for it.",
        },
        text: "Failed to extract strategy parameters: ask user for risk profile",
      };
    }

    data.riskProfile = strategy;

    const filteredStrategies = strategies.filter(
      (s) => s.strategy.toLowerCase() === strategy.toLowerCase()
    );

    if (!filteredStrategies.length) {
      return {
        ...EMPTY_RESULT,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategy: "No strategies found for risk profile",
        },
      };
    }

    if (filteredStrategies.length === 1) {
      data.strategy = filteredStrategies[0];
    } else if (contract) {
      data.strategy = filteredStrategies.find(
        (s) => s.contractAddress.toLowerCase() === contract.toLowerCase()
      );
    }

    strategiesText = strategies.map(service.formatStrategy).join("\n");

    if (!data.strategy) {
      return {
        ...EMPTY_RESULT,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategy: "Multiple strategies found, ask user for contract address",
        },
        text: "Failed to extract strategy parameters: ask user for contract address",
      };
    }

    const strategyData = await service.getStrategyData(data.strategy);

    const _token: string | undefined =
      strategyData.type === "vault"
        ? strategyData.data.asset
        : data.strategy.bundler
          ? undefined
          : strategyData.data.baseToken;

    if (_token) {
      // token from strategy data first
      data.tokenIn = await service.getTokenDataWithInfo({
        chainId,
        symbolOrAddress: _token,
      });
    } else if (token) {
      // if not found - attempt to get from user input
      data.tokenIn = await service.getTokenDataWithInfo({
        chainId,
        symbolOrAddress: token,
      });
    }

    if (!data.tokenIn) {
      return {
        ...EMPTY_RESULT,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategy: service.formatStrategy(data.strategy),
          tokenIn: "Unknown token, ask user for it.",
        },
        text: "Failed to extract strategy parameters: Ask user for token address",
      };
    }

    if (!amount) {
      return {
        ...EMPTY_RESULT,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategy: service.formatStrategy(data.strategy),
          tokenIn: service.formatToken(data.tokenIn),
          amountIn: "Unknown amount, ask user for it.",
        },
        text: "Failed to extract strategy parameters: Ask user for amount",
      };
    }

    const amountUnits = parseUnits(amount, data.tokenIn.decimals);

    const balance = await service.getBalanceOf(
      user.address,
      chainId,
      data.tokenIn.address ?? ETH_NULL_ADDR
    );

    runtime.logger.debug(
      `Balance of ${data.tokenIn.symbol}: ${balance?.amount.toString()}, requested amount: ${amountUnits.toString()}`
    );

    if ((balance?.amount ?? 0n) < amountUnits) {
      return {
        ...EMPTY_RESULT,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategy: service.formatStrategy(data.strategy),
          tokenIn: service.formatToken(data.tokenIn),
          amountIn: `Balance less than ${amount} ${data.tokenIn.symbol}, ask user to deposit more or swap existing assets`,
        },
        text: `Balance less than ${amount} ${data.tokenIn.symbol}, ask user to deposit more or swap existing assets`,
      };
    }

    data.amount = amount;
    data.leverage = leverage;
    const strategyText = service.formatStrategy(data.strategy);
    const tokenText = service.formatToken(data.tokenIn);

    return {
      ...EMPTY_RESULT,
      data,
      values: {
        strategies: strategiesText,
        portfolio: portfolioText,
        strategy: strategyText,
        tokenIn: tokenText,
        amountIn: amount,
      },
      text: `Selected strategy: ${strategyText}.\n\nSelected token: ${tokenText}.\n\nSelected amount: ${amount}`,
    };
  },
};
