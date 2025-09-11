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
import { IntentManager, IntentContext } from "../services/intent-manager";
import { Suggestion } from "./types";
import { handleWithdrawIntent } from "./intents/withdraw";

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
  description:
    "Handle withdrawal requests from Levva positions with multi-step process support",
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
${positionParams.positionsSummary}

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
    logger.error("Error in MANAGE_POSITIONS action:", error);
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
    "redeem",
    "cash out",
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
      "Suggest position management options when user has active positions",
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

      const { summary } = await service.getPositionSummary(address, chainId);

      return positionManagementPrompt({
        conversation,
        decision,
        positionsSummary: summary.positionsSummary,
        totalPositionValue: summary.totalPositionValue,
        withdrawalsSummary: summary.withdrawalsSummary,
        hasPositions: summary.hasPositions,
      });
    },
  },
  {
    name: "position-diversification",
    description:
      "Suggest diversification options when user has positions in limited strategies",
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

      const { summary, strategies } = await service.getPositionSummary(
        address,
        chainId
      );

      const availableStrategies = strategies.filter((strategy) => {
        const hasPosition = summary.positions.some(
          (pos: any) => pos.strategyId === strategy.id
        );
        return !hasPosition;
      });

      return positionDiversificationPrompt({
        conversation,
        decision,
        positionsSummary: summary.positionsSummary,
        availableStrategiesFormatted: availableStrategies
          .map(
            (s) =>
              `${s.name} - Contract: ${s.vault?.address}. Type: "vault". ${s.description}`
          )
          .join("\n"),
      });
    },
  },
];
