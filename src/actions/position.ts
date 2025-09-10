import {
  Action,
  Content,
  logger,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionResult,
} from "@elizaos/core";
import { isHex, parseUnits } from "viem";
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
import { ExtractedDataForWithdraw } from "src/prompts/withdraw";
import { StrategiesResponse, WithdrawalRequest } from "src/api/levva/schema";
import { CalldataWithDescription } from "src/types/tx";

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

async function validateAction(runtime: IAgentRuntime, message: Memory) {
  try {
    const composedState = await runtime.composeState(message, [
      LEVVA_PROVIDER_NAME,
      POSITION_PARAMS_PROVIDER_NAME,
    ]);

    const lvva = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      composedState
    );

    if (!lvva?.user?.address) {
      return false;
    }

    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      return false;
    }

    // Always allow position management - we can show "no positions" status
    return true;
  } catch (error) {
    runtime.logger.warn(
      "Error checking user positions in position validate:",
      error
    );
    return false;
  }
}

async function handleRequestRedeem(
  runtime: IAgentRuntime,
  address: `0x${string}`,
  strategy: StrategiesResponse[number],
  amount: number | "all"
): Promise<Content> {
  const levvaService = runtime.getService<LevvaService>(
    LEVVA_SERVICE.LEVVA_COMMON
  );

  if (!levvaService) {
    throw new Error("Failed to get levva service");
  }

  const lpTokenAddress = strategy.vault?.lpToken.address;

  if (!isHex(lpTokenAddress)) {
    throw new Error(`Incorrect LP token address for strategy ${strategy.id}`);
  }

  const chainId = strategy.vault?.publicChainId ?? 1;

  const lpToken = await levvaService.getTokenDataWithInfo({
    chainId: strategy.vault?.publicChainId ?? 1,
    symbolOrAddress: lpTokenAddress,
  });

  if (!lpToken) {
    throw new Error(`LP token not found for strategy ${strategy.id}`);
  }

  const balance = await levvaService.getBalanceOf(
    address,
    chainId,
    lpToken.address! // lp token guaranteed not ETH
  );

  let amountOut: bigint;

  if (amount === "all") {
    amountOut = balance?.amount ?? 0n;
  } else {
    amountOut = parseUnits(amount.toString(), lpToken.decimals);
  }

  if (amountOut > (balance?.amount ?? 0n)) {
    throw new Error(`Insufficient balance for ${lpToken.symbol}`);
  }

  const to = strategy.vault?.address;

  if (!isHex(to)) {
    throw new Error(`Incorrect vault address for strategy ${strategy.id}`);
  }

  const calldata: CalldataWithDescription = {
    to,
    data: levvaService.encodeRequestRedeem(amountOut),
    value: "0",
    title: `Withdraw ${amount} ${strategy.vault?.underlyingToken.symbol}`,
    description: `Request withdrawal of ${amount} tokens from ${strategy.name} vault. This will initiate the withdrawal process and you'll receive a request ID.`,
  };

  const calldataHash = await levvaService.createCalldata([calldata]);

  const content: Content = {
    thought: `I need to display transaction details for request redeem`,
    text: `Ready to initiate withdrawal of ${amount} from ${strategy.name}!

**Step 1: Request Withdrawal**
Please sign this transaction to request your withdrawal.

After signing, you'll receive withdrawal NFT to your wallet. The withdrawal will need to be processed (usually takes a few minutes), then you can claim your funds.`,
    attachments: [
      {
        id: "calls.json",
        url: `/api/calldata?hash=${calldataHash}`,
      },
    ],
  };

  return content;
}

async function handleClaimWithdrawal(
  runtime: IAgentRuntime,
  address: `0x${string}`,
  nftAddress: `0x${string}`,
  strategy: StrategiesResponse[number],
  withdrawal: WithdrawalRequest
): Promise<Content> {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  if (!withdrawal.isFinalized) {
    throw new Error(
      `Withdrawal not finalized(requestId: ${withdrawal.requestId})`
    );
  }

  const calldata: CalldataWithDescription = {
    to: nftAddress,
    data: service.encodeClaimWithdrawal(withdrawal.requestId, address),
    value: "0",
    title: `Claim Withdrawal`,
    description: `Claim withdrawal of ${withdrawal.amount} tokens from request #${withdrawal.requestId}. This will transfer the funds to your wallet.`,
  };

  const calldataHash = await service.createCalldata([calldata]);

  return {
    thought: `I need to display transaction details for claim withdrawal`,
    text: `Ready to claim your withdrawal!

**Step 3: Claim Withdrawal**
Request #${withdrawal.requestId} for ${withdrawal.amount} tokens from ${strategy.name} is ready to be claimed.

Please sign this transaction to claim your funds.

After signing, you'll receive your withdrawn funds directly to your wallet.`,
    attachments: [
      {
        id: "calls.json",
        url: `/api/calldata?hash=${calldataHash}`,
      },
    ],
  };
}

async function handleWithdrawIntent(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  const lvva = selectProviderState<LevvaProviderState>(
    LEVVA_PROVIDER_NAME,
    state
  );

  const params = selectProviderState<PositionParamsProviderData>(
    POSITION_PARAMS_PROVIDER_NAME,
    state
  );

  const address = lvva?.user?.address;

  if (!isHex(address)) {
    throw new Error("Invalid address");
  }

  // todo proper typing
  const withdrawParams = intentContext.returnData as ExtractedDataForWithdraw;

  if (!withdrawParams) {
    const errorContent = await rephrase({
      runtime,
      content: {
        text: "I need more information to process your withdrawal. Please specify which position you'd like to withdraw from and the amount.",
        source: message.content.source,
      },
      // state,
      prevActions,
    });

    await callback(errorContent);

    return {
      text: "Generated withdrawal parameter request",
      success: true,
      values: {
        success: true,
        responded: true,
        lastReply: errorContent.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        intentType: "WITHDRAW",
        intentId: intentContext.id,
        needsMoreInfo: true,
      },
    };
  }

  const { strategyId, amount, withdrawalStep, nftAddress } = withdrawParams;

  if (!strategyId) {
    const errorContent = await rephrase({
      runtime,
      content: {
        text: "I need more information to process your withdrawal. Please specify which position you'd like to withdraw from.",
        source: message.content.source,
      },
      // state,
      prevActions,
    });

    await callback(errorContent);

    return {
      text: "Generated withdrawal parameter request",
      success: true,
      values: {
        success: true,
        responded: true,
        lastReply: errorContent.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        intentType: "WITHDRAW",
        intentId: intentContext.id,
        needsMoreInfo: true,
      },
    };
  }

  const strategy = params?.strategies.find((s) => s.id === strategyId);

  if (!strategy) {
    throw new Error(`Strategy not found(id: ${strategyId})`);
  }

  const withdrawal = params?.withdrawalRequests.find(
    (r) => r.strategyId === strategy.id
  );

  try {
    let result: Content;
    // Handle different withdrawal steps
    switch (withdrawalStep) {
      case "request": {
        if (!amount) {
          const errorContent = await rephrase({
            runtime,
            content: {
              text: "I need more information to process your withdrawal. Please specify the amount you'd like to withdraw.",
              source: message.content.source,
            },
            // state,
            prevActions,
          });

          await callback(errorContent);

          return {
            text: "Generated withdrawal parameter request",
            success: true,
            values: {
              success: true,
              responded: true,
              lastReply: errorContent.text,
              lastReplyTime: Date.now(),
            },
            data: {
              actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
              intentType: "WITHDRAW",
              intentId: intentContext.id,
              needsMoreInfo: true,
            },
          };
        }

        result = await handleRequestRedeem(runtime, address, strategy, amount);
        break;
      }

      case "check":
        {
          if (!withdrawal) {
            throw new Error(`Withdrawal not found(strategyId: ${strategyId})`);
          }

          result = {
            thought: `I need to display withdrawal status`,
            text: `### Your withdrawal
${withdrawal.amount} tokens from ${strategy.name}
${withdrawal.isFinalized ? "Ready to claim" : "Processing..."}
NFT Address: ${nftAddress}`,
          };
        }
        break;
      case "claim": {
        if (!withdrawal) {
          throw new Error(`Withdrawal not found(strategyId: ${strategyId})`);
        }

        if (!isHex(nftAddress)) {
          throw new Error(`NFT address not found(strategyId: ${strategyId})`);
        }

        result = await handleClaimWithdrawal(
          runtime,
          address,
          nftAddress,
          strategy,
          withdrawal
        );
        break;
      }
      default:
        throw new Error(`Invalid withdrawal step: ${withdrawalStep}`);
    }

    const responseContent = await rephrase({
      runtime,
      content: result,
      prevActions,
    });

    await callback(responseContent);

    return {
      text: `Generated withdrawal ${withdrawalStep}: ${responseContent?.text}`,
      success: true,
      values: {
        success: true,
        responded: true,
        lastReply: responseContent.text,
        lastReplyTime: Date.now(),
        thoughtProcess: responseContent?.thought,
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        intentType: "WITHDRAW",
        intentId: intentContext.id,
        withdrawalStep: withdrawalStep,
        strategyId,
        userAddress: address,
        response: responseContent,
      },
    };
  } catch (error) {
    runtime.logger.error("Error in withdraw intent handler:", error);

    const errorContent = await rephrase({
      runtime,
      content: {
        text: `I encountered an error while processing your withdrawal: ${(error as Error).message}. Please try again.`,
        source: message.content.source,
      },
      state,
      prevActions,
    });

    await callback(errorContent);
    return {
      text: `Error processing withdrawal: ${(error as Error).message}`,
      success: false,
      values: {
        success: false,
        error: true,
        responded: true,
        lastReply: errorContent.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        intentType: "WITHDRAW",
        error: (error as Error).message,
      },
      error: error as Error,
    };
  }
}

async function handleAction(
  runtime: IAgentRuntime,
  message: Memory,
  _state?: State,
  _options?: {},
  callback?: HandlerCallback
) {
  logger.info(`[MANAGE_POSITIONS] Action started for: "${message.content.text}"`);
  
  // Get previous action results from runtime to avoid repetition (outside try block for error handler access)
  const prevActions = await getPreviousReplyContext(runtime, message);

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

    // Get available strategies for suggestions
    const strategies = await service.getStrategies(lvva.chainId);

    const availableStrategies = strategies.filter((strategy) => {
      // Filter out strategies user already has positions in
      const hasPosition = positionParams.userPositions.some(
        (pos: any) => pos.strategyId === strategy.contractAddress
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
${availableStrategies.map(service.formatStrategy).join("\n\n")}

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

      if (positionParams.hasPendingWithdrawals) {
        managementSuggestions.push(
          "- **Check Status**: Monitor withdrawal progress and claim ready funds"
        );
      } else if (positionParams.hasPositions) {
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
${availableStrategies.map(service.formatStrategy).join("\n\n")}`
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
      const service = runtime.getService<LevvaService>("levva");
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
      const service = runtime.getService<LevvaService>("levva");
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
          .map((s) => service.formatStrategy(s))
          .join("\n"),
      });
    },
  },
];
