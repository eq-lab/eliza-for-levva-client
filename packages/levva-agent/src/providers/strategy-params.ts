import { Provider } from "@elizaos/core";
import { EMPTY_RESULT, selectProviderState, checkSimpleReply } from "./util";
import { LEVVA_SERVICE } from "../constants/enum";
import { LevvaService } from "../services/levva/class";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from ".";

/** @deprecated better typing */
type Strategies = Awaited<
  ReturnType<LevvaService["strategy"]["getStrategies"]>
>;

export interface StrategyParamsProviderData {
  strategies: Strategies;
  strategiesText: string;
  portfolioText: string;
}
export const STRATEGY_PARAMS_PROVIDER_NAME = "STRATEGY_PARAMS";

export const strategyParamsProvider: Provider = {
  name: STRATEGY_PARAMS_PROVIDER_NAME,
  description:
    "Provides basic strategy and portfolio information for strategy recommendations. Parameter extraction is handled by the deposit intent system.",
  dynamic: true,
  async get(runtime, message, state) {
    const simpleReply = checkSimpleReply(
      runtime,
      state,
      STRATEGY_PARAMS_PROVIDER_NAME,
      "Strategy data"
    );
    if (simpleReply) return simpleReply;

    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      return {
        ...EMPTY_RESULT,
        text: `Service "${LEVVA_SERVICE.LEVVA_COMMON}" not found. Unable to get strategy data.`,
      };
    }

    const lvva = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      state
    );

    if (!lvva?.user) {
      return {
        ...EMPTY_RESULT,
        text: `User address not found. Unable to get strategy data.`,
      };
    }

    const { user, chainId } = lvva;

    try {
      const [strategies, portfolio] = await Promise.all([
        service.strategy.getStrategies(chainId),
        service.getWalletAssets({
          address: user.address,
          chainId,
        }),
      ]);

      const strategiesText = strategies
        .map((s) => service.strategy.formatStrategy(s))
        .join("\n");
      const portfolioText = service.wallet.formatWalletAssets(portfolio, true);

      const data: StrategyParamsProviderData = {
        strategies,
        strategiesText,
        portfolioText,
      };

      return {
        text: `Available Strategies:\n${strategiesText}\n\nCurrent Portfolio:\n${portfolioText}`,
        data,
        values: {
          strategies: strategiesText,
          portfolio: portfolioText,
          strategiesCount: strategies.length,
        },
      };
    } catch (error) {
      runtime.logger.error("Error in strategy params provider:", error);
      return {
        ...EMPTY_RESULT,
        text: "Failed to load strategy and portfolio data",
      };
    }
  },
};
