import { Action, Content, logger } from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import { POSITION_PARAMS_PROVIDER_NAME, PositionParamsProviderData } from "../providers/position-params";
import { selectProviderState } from "../providers/util";
import { LevvaService } from "../services/levva/class";
import { rephrase } from "../util/generate";
import { getPreviousReplyContext } from "../util/action-results";
import { Suggestion } from "./types";

const description =
  "Analyze user's current positions, show withdrawal status, and suggest position management actions.";

export const action: Action = {
  name: LEVVA_ACTIONS.MANAGE_POSITIONS,
  description,
  similes: [
    "MANAGE_POSITIONS",
    "VIEW_POSITIONS", 
    "CHECK_POSITIONS",
    "POSITION_STATUS",
    "manage positions",
    "view positions",
    "check my positions",
    "position status",
    "my portfolio",
    "withdrawal status",
  ],

  validate: async () => {
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    // Get previous action results from runtime to avoid repetition (outside try block for error handler access)
    const prevActions = await getPreviousReplyContext(runtime, message);
    
    // Compose state with position params provider to ensure it's executed
    const composedState = await runtime.composeState(message, [POSITION_PARAMS_PROVIDER_NAME]);
    
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

      const positionData = selectProviderState<PositionParamsProviderData>(
        POSITION_PARAMS_PROVIDER_NAME,
        composedState
      );

      if (!positionData) {
        throw new Error(
          `Failed to get provider(${POSITION_PARAMS_PROVIDER_NAME}) results`
        );
      }

      // Get available strategies for suggestions
      const strategies = await service.getStrategies(lvva.chainId);
      const availableStrategies = strategies
        .filter((strategy) => {
          // Filter out strategies user already has positions in
          const hasPosition = positionData.userPositions.some(
            (pos: any) => pos.strategyId === strategy.contractAddress
          );
          return !hasPosition;
        })
        .slice(0, 3); // Limit to top 3 suggestions

      let thought: string;
      let text: string;

      if (!positionData.hasPositions && !positionData.hasPendingWithdrawals) {
        // No positions case
        thought = "User has no active positions or pending withdrawals. Should suggest available strategies.";
        text = `You currently have no active positions in Levva strategies.

## Available Strategies
${availableStrategies.map(service.formatStrategy).join("\n\n")}

Would you like to explore any of these investment opportunities?`;
      } else {
        // Has positions case
        thought = "User has active positions. Should show current status and suggest management actions.";
        
        const managementSuggestions: string[] = [];
        
        if (positionData.hasPositions) {
          managementSuggestions.push("- **Withdraw**: Exit current positions");
          if (availableStrategies.length > 0) {
            managementSuggestions.push("- **Diversify**: Add positions in other strategies");
          }
        }
        
        if (positionData.hasPendingWithdrawals) {
          managementSuggestions.push("- **Track**: Monitor withdrawal progress");
        }

        text = `## Your Position Summary
${positionData.positionsSummary}

**Total Portfolio Value**: ${composedState.values.totalValue}

## Withdrawal Status
${positionData.withdrawalsSummary}

## Management Options
${managementSuggestions.join("\n")}

${availableStrategies.length > 0 ? `## Other Available Strategies
${availableStrategies.map(service.formatStrategy).join("\n\n")}` : ""}`;
      }

      const content: Content = {
        thought,
        text,
        actions: ["MANAGE_POSITIONS"],
        source: message.content.source,
      };

      const responseContent = await rephrase({ runtime, content, state: composedState, prevActions });
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
          positionData,
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
  },

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
          text: "Here's your current position summary:\n\n{{positionsSummary}}\n\nTotal value: {{totalValue}}",
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
    name: "position-diversification",
    description: "Suggest diversification options when user has positions in limited strategies",
    getPrompt: async (runtime, { address, chainId, conversation, decision }) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const [summary, strategies] = await Promise.all([
        service.getPositionSummary(address),
        service.getStrategies(chainId),
      ]);

      const availableStrategies = strategies.filter((strategy) => {
        const hasPosition = summary.positions.some(
          (pos: any) => pos.strategyId === strategy.contractAddress
        );
        return !hasPosition;
      });

      return `<task>Generate suggestions for portfolio diversification based on current positions and available strategies</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${summary.positionsSummary}
</currentPositions>
<availableStrategies>
${availableStrategies.map((s) => service.formatStrategy(s)).join("\n")}
</availableStrategies>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4 suggestions for diversifying the portfolio:
1. Suggest different risk levels if user is concentrated in one risk category
2. Suggest different strategy types (vault vs pool) for balance
3. Consider withdrawal options if overexposed
4. Suggest rebalancing based on performance

Each suggestion should be actionable and specific.
</instructions>
<output>
{
  "suggestions": [
    {
      "label": "Add Safe Strategy",
      "text": "I want to diversify with a safe strategy"
    },
    {
      "label": "Withdraw 25%", 
      "text": "I want to withdraw 25% of my positions"
    }
  ]
}
</output>`;
    },
  },
];
