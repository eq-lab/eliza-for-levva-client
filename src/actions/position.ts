import {
  Action,
  Content,
  logger,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE, INTENT_TYPE } from "../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import { selectProviderState } from "../providers/util";
import {
  POSITION_PARAMS_PROVIDER_NAME,
  PositionParamsProviderData,
} from "../providers/position-params";
import { LevvaService } from "../services/levva/class";
import { rephrase } from "../util/generate";
import { getPreviousReplyContext } from "../util/action-results";
import { positionManagementPrompt } from "../prompts/suggest/position-management";
import { positionDiversificationPrompt } from "../prompts/suggest/position-diversification";
import { depositOpportunitiesPrompt } from "../prompts/suggest/deposit-opportunities";
import { ETH_NULL_ADDR } from "../constants/eth";
import { IntentManager, IntentContext } from "../services/intent-manager";
import { Suggestion } from "./types";
import {
  handleWithdrawIntent,
  generateWithdrawSuggestions,
  handleDepositIntent,
  generateDepositSuggestions,
} from "./intents";

// Register the withdraw intent
IntentManager.registerIntent({
  type: INTENT_TYPE.WITHDRAW,
  domain: LEVVA_ACTIONS.MANAGE_POSITIONS,
  keywords: [
    "withdraw",
    "redeem",
    "cash out",
    "exit",
    "claim",
    "liquidate",
    "unstake",
    "get out",
    "take out",
  ],
  handler: handleWithdrawIntent,
  generateSuggestions: generateWithdrawSuggestions,
  description:
    "Handle withdrawal requests from Levva positions with multi-step process support",
});

// Register the deposit intent
IntentManager.registerIntent({
  type: INTENT_TYPE.DEPOSIT,
  domain: LEVVA_ACTIONS.MANAGE_POSITIONS,
  keywords: [
    "deposit",
    "invest",
    "stake",
    "add funds",
    "put money",
    "increase position",
    "add to position",
    "fund",
    "contribute",
    // Removed strategy-related keywords - too generic:
    // "strategy", "earning strategy", "farming strategy", "select strategy", "suggest strategy"
    // These can trigger on informational queries like "show me strategies"
  ],
  handler: handleDepositIntent,
  generateSuggestions: generateDepositSuggestions,
  description:
    "Handle deposit/investment requests for Levva strategies with transaction creation and multi-step process support",
});

async function validateAction() {
  return true;
}

async function handleAction(
  runtime: IAgentRuntime,
  message: Memory,
  state?: State,
  _options?: {},
  callback?: HandlerCallback
) {
  logger.info(
    `[MANAGE_POSITIONS] Action started for: "${message.content.text}"`
  );

  // Get previous action results from runtime to avoid repetition (outside try block for error handler access)
  const prevActions = await getPreviousReplyContext(runtime, message, state);

  // Compose state with position params provider to ensure it's executed
  const composedState = await runtime.composeState(message, [
    POSITION_PARAMS_PROVIDER_NAME,
  ]);

  let intentContext: IntentContext | undefined;

  try {
    if (!callback) {
      throw new Error("Callback not found, disable action");
    }

    if (!composedState) {
      throw new Error("State not found, disable action");
    }

    const lvva = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      composedState
    );

    if (!lvva?.user) {
      throw new Error("User address is required");
    }

    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      throw new Error("Failed to get levva service, disable action");
    }

    const positionParams = selectProviderState<PositionParamsProviderData>(
      POSITION_PARAMS_PROVIDER_NAME,
      composedState
    );

    if (!positionParams) {
      throw new Error(
        `Failed to get provider(${POSITION_PARAMS_PROVIDER_NAME}) results`
      );
    }

    intentContext = positionParams.intentContext;

    if (intentContext) {
      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      if (!intentManager) {
        throw new Error("Failed to get intent manager");
      }

      return intentManager.executeIntentHandler(
        intentContext,
        runtime,
        message,
        composedState,
        callback,
        prevActions
      );
    }

    // Get available strategies for suggestions (use strategies from provider which has .id)
    const availableStrategies = positionParams.strategies.filter((strategy) => {
      // Filter out strategies user already has positions in
      const hasPosition = positionParams.userPositions.some(
        (pos: any) => pos.strategyId === strategy.id
      );
      return !hasPosition;
    });

    let thought: string;
    let text: string;

    if (!positionParams.hasPositions && !positionParams.hasPendingWithdrawals) {
      // No positions case
      thought =
        "User has no active positions or pending withdrawals. Should suggest available strategies.";
      text = `You currently have no active positions in Levva strategies.

## Available Strategies
${availableStrategies
  .map(
    (strategy) =>
      `${strategy.name} - Contract: ${strategy.vault?.address}. Type: "vault". ${strategy.description}`
  )
  .join("\n\n")}

Would you like to explore any of these investment opportunities?`;
    } else {
      // Has positions case
      thought =
        "User has active positions. Should show current status and suggest management actions.";

      // DEFENSIVE: Build position summary from raw data if positionsSummary is empty or invalid
      let positionsSummary = positionParams.positionsSummary;

      if (
        !positionsSummary ||
        positionsSummary.trim() === "" ||
        positionsSummary === "No active positions" ||
        positionsSummary === "Error loading positions"
      ) {
        if (
          positionParams.userPositions &&
          positionParams.userPositions.length > 0
        ) {
          // Rebuild summary from raw position data using standard formatting
          positionsSummary = positionParams.userPositions
            .map((pos, idx) => {
              const strategy = positionParams.strategies?.find(
                (s) => s.id === pos.strategyId
              );
              const strategyName =
                strategy?.name || `Strategy ${pos.strategyId}`;
              const assetSymbol =
                strategy?.vault?.underlyingToken?.symbol || "tokens";
              const balanceDisplay = `${pos.balance.toFixed(4)} ${assetSymbol}`;

              // Format: "Strategy Name (Risk level strategy): Amount TOKEN Deposited"
              const riskLevel = strategy?.strategy
                ? `${strategy.strategy.charAt(0).toUpperCase() + strategy.strategy.slice(1)} strategy`
                : "Strategy";

              return `${idx + 1}. ${strategyName} (${riskLevel}): ${balanceDisplay} Deposited`;
            })
            .join("\n");
        } else {
          positionsSummary = "No active positions";
        }
      }

      const managementSuggestions: string[] = [];

      if (positionParams.hasPositions) {
        managementSuggestions.push(
          "- **Withdraw**: Exit current positions (partial or full)"
        );

        if (availableStrategies.length > 0) {
          managementSuggestions.push(
            "- **Diversify**: Add positions in other strategies"
          );
        }
      }

      if (positionParams.hasReadyWithdrawals) {
        managementSuggestions.push(
          "- **Claim Funds**: Claim your ready withdrawal requests"
        );
      }

      if (positionParams.hasPendingWithdrawals) {
        managementSuggestions.push(
          "- **Check Status**: Monitor withdrawal progress"
        );
      }

      if (
        positionParams.hasPositions &&
        !positionParams.hasPendingWithdrawals
      ) {
        managementSuggestions.push(
          "- **Quick Withdraw**: Start withdrawal process for any position"
        );
      }

      text = `## Your Position Summary
${positionsSummary}

**Total Portfolio Value**: ${composedState.values.totalValue}

## Withdrawal Status
${positionParams.withdrawalsSummary}

## Management Options
${managementSuggestions.join("\n")}

${
  availableStrategies.length > 0
    ? `## Other Available Strategies
${availableStrategies
  .map(
    (strategy) =>
      `${strategy.name} - Contract: ${strategy.vault?.address}. Type: "vault". ${strategy.description}`
  )
  .join("\n\n")}`
    : ""
}`;
    }

    const content: Content = {
      thought,
      text,
      actions: ["MANAGE_POSITIONS"],
      source: message.content.source,
    };

    const responseContent = await rephrase({
      runtime,
      content,
      state: composedState,
      prevActions,
      skipRephrase: true, // Preserve exact position data and actions
    });
    await callback(responseContent);

    return {
      text: `Generated text: ${responseContent?.text}`,
      values: {
        success: true,
        responded: true,
        lastReply: responseContent.text,
        lastReplyTime: Date.now(),
        thoughtProcess: responseContent?.thought,
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        response: responseContent,
        thought: responseContent?.thought,
        initialReply: content.text,
        initialThought: content.thought,
        messageGenerated: true,
        positionParams,
      },
      success: true,
    };
  } catch (error) {
    logger.error(
      "Error in MANAGE_POSITIONS action:",
      error instanceof Error ? error.message : String(error)
    );
    const errorMessage = (error as Error).message ?? "unknown error";
    const thought = `Action failed with error: ${errorMessage}. I should tell the user about the error.`;
    const text = `Failed to analyze positions, reason: ${errorMessage}. Please try again.`;

    const responseContent = await rephrase({
      runtime,
      content: {
        text,
        thought,
        actions: ["MANAGE_POSITIONS"],
        source: message.content.source,
      },
      state: composedState,
      prevActions,
    });

    await callback?.(responseContent);

    return {
      text: `Error analyzing positions: ${errorMessage}.`,
      values: {
        success: false,
        responded: true,
        error: true,
        lastReply: responseContent.text,
        lastReplyTime: Date.now(),
        thoughtProcess: responseContent?.thought,
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        error: errorMessage,
      },
      success: false,
      error: error as Error,
    };
  }
}

const description =
  "Unified position management action with intent-based routing. Handles viewing positions, withdrawing from positions, and increasing positions with multi-step transaction support and intelligent intent detection.";

export const action: Action = {
  name: LEVVA_ACTIONS.MANAGE_POSITIONS,
  description,
  similes: [
    "MANAGE_POSITIONS",
    "VIEW_POSITIONS",
    "CHECK_POSITIONS",
    "POSITION_STATUS",
    "WITHDRAW",
    "REDEEM",
    "manage positions",
    "view positions",
    "check my positions",
    "position status",
    "show me my positions",
    "what positions do I have",
    "current positions",
    "position overview",
    "manage my portfolio",
    "position management",
    "withdraw",
    "I want to withdraw",
    "want to withdraw",
    "need to withdraw",
    "redeem",
    "cash out",
    "I want to cash out",
    "I'd like to cash out",
    "exit position",
    "claim",
    "liquidate",
    "unstake",
    "get out",
    "take out",
  ],

  validate: validateAction,

  handler: handleAction,

  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Show me my positions",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Here's your current position summary:\n\n{{positionsSummary}}\n\nTotal Portfolio Value: {{totalValue}}\n\nLet me know if you want to manage these positions or need help with anything else!",
          actions: ["MANAGE_POSITIONS"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I want to withdraw",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "I can help you withdraw from your positions. Let me show you your current positions:\n\n{{positionsSummary}}\n\nWhich position would you like to withdraw from?",
          actions: ["MANAGE_POSITIONS"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "I'd like to cash out",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "I'll help you cash out. Here are your positions:\n\n{{positionsSummary}}\n\nPlease let me know which one you'd like to withdraw from and how much.",
          actions: ["MANAGE_POSITIONS"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Check my withdrawal status",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Your withdrawal status:\n\n{{withdrawalsSummary}}",
          actions: ["MANAGE_POSITIONS"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "What positions do I have?",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "You have the following active positions:\n\n{{positionsSummary}}\n\nWould you like to manage any of these positions?",
          actions: ["MANAGE_POSITIONS"],
        },
      },
    ],
  ],
};

export const suggest: Suggestion[] = [
  {
    name: "position-management",
    description:
      "Suggest intelligent position management options including deposit opportunities based on current positions",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision }
    ) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [{ summary, strategies }, portfolio] = await Promise.all([
        service.getPositionSummary(address, chainId),
        service.getWalletAssets({ address, chainId }),
      ]);

      // Check for ETH in portfolio
      const ethAsset = portfolio.find(
        (asset) =>
          asset.token === ETH_NULL_ADDR || asset.address === ETH_NULL_ADDR
      );
      const hasEth = ethAsset ? ethAsset.amount > 0n : false;

      // Get available strategies for deposit suggestions
      const availableStrategies = strategies
        .map((s) => `${s.name} (${s.risk} risk) - ${s.shortDescription}`)
        .join("\n");

      // Analyze risk distribution
      const riskLevels = summary.positions.map((pos: any) => {
        const strategy = strategies.find((s) => s.id === pos.strategyId);
        return strategy?.risk || "unknown";
      });
      const uniqueRisks = [...new Set(riskLevels)];
      const riskDistribution = `Risk levels: ${uniqueRisks.join(", ")} (${riskLevels.length} positions)`;

      return positionManagementPrompt({
        conversation,
        decision,
        positionsSummary: summary.positionsSummary,
        totalPositionValue: summary.totalPositionValue,
        withdrawalsSummary: summary.withdrawalsSummary,
        hasPositions: summary.hasPositions,
        availableStrategies,
        portfolioText: service.wallet.formatWalletAssets(portfolio, true),
        hasEth,
        riskDistribution,
      });
    },
  },
  {
    name: "position-diversification",
    description:
      "Suggest deposit-focused diversification options to balance portfolio risk and strategy exposure",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision }
    ) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [{ summary, strategies }, portfolio] = await Promise.all([
        service.getPositionSummary(address, chainId),
        service.getWalletAssets({ address, chainId }),
      ]);

      // Filter strategies user doesn't have positions in
      const availableStrategies = strategies.filter((strategy) => {
        const hasPosition = summary.positions.some(
          (pos: any) => pos.strategyId === strategy.id
        );
        return !hasPosition;
      });

      // Check for ETH in portfolio
      const ethAsset = portfolio.find(
        (asset) =>
          asset.token === ETH_NULL_ADDR || asset.address === ETH_NULL_ADDR
      );
      const hasEth = ethAsset ? ethAsset.amount > 0n : false;

      // Analyze current risk levels
      const currentRiskLevels = summary.positions.map((pos: any) => {
        const strategy = strategies.find((s) => s.id === pos.strategyId);
        return strategy?.risk || "unknown";
      });
      const uniqueCurrentRisks = [...new Set(currentRiskLevels)];

      return positionDiversificationPrompt({
        conversation,
        decision,
        positionsSummary: summary.positionsSummary,
        availableStrategiesFormatted: availableStrategies
          .map(
            (s) =>
              `${s.name} (${s.risk} risk, ${s.category}) - ${s.shortDescription}. Contract: ${s.vault?.address || "N/A"}`
          )
          .join("\n"),
        portfolioText: service.wallet.formatWalletAssets(portfolio, true),
        hasEth,
        currentRiskLevels: uniqueCurrentRisks,
      });
    },
  },
  {
    name: "deposit-opportunities",
    description:
      "Suggest specific deposit opportunities based on user's portfolio and existing positions",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision }
    ) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [{ summary, strategies }, portfolio] = await Promise.all([
        service.getPositionSummary(address, chainId),
        service.getWalletAssets({ address, chainId }),
      ]);

      // Check for ETH in portfolio
      const ethAsset = portfolio.find(
        (asset) =>
          asset.token === ETH_NULL_ADDR || asset.address === ETH_NULL_ADDR
      );
      const hasEth = ethAsset ? ethAsset.amount > 0n : false;

      // Get tokens with significant balances for deposit suggestions
      const significantTokens = portfolio
        .filter((asset) => asset.amount > 0n)
        .map((asset) => asset.token)
        .slice(0, 5); // Top 5 tokens by balance

      return depositOpportunitiesPrompt({
        conversation,
        decision,
        positionsSummary: summary.positionsSummary,
        totalPositionValue: summary.totalPositionValue,
        hasPositions: summary.hasPositions,
        availableStrategies: strategies
          .map((s) => `${s.name} (${s.risk} risk) - ${s.shortDescription}`)
          .join("\n"),
        portfolioText: service.wallet.formatWalletAssets(portfolio, true),
        hasEth,
        significantTokens,
      });
    },
  },
];
