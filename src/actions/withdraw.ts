import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  type Action,
} from "@elizaos/core";
import { isHex } from "viem";
import { rephrase } from "../util/generate";
import { getPreviousReplyContext } from "../util/action-results";
import { LevvaService } from "../services/levva/class";
import { LEVVA_PROVIDER_NAME } from "../providers/index";
import { WITHDRAW_PARAMS_PROVIDER_NAME } from "../providers/withdraw-params";
import type { Suggestion } from "./types";
import { getStrategies as getStrategiesApi } from "../api/levva";
import { withdrawalStatusCheckPrompt } from "../prompts/suggest/withdrawal-status-check";
import { withdrawalGuidancePrompt } from "../prompts/suggest/withdrawal-guidance";

export const WITHDRAW_ACTION_NAME = "WITHDRAW";

export const action: Action = {
  name: WITHDRAW_ACTION_NAME,
  similes: [
    "REDEEM",
    "CASH_OUT",
    "EXIT_POSITION",
    "CLAIM_FUNDS",
    "LIQUIDATE",
    "UNSTAKE",
  ],
  description: `Withdraw funds from Levva positions. Handles multi-step withdrawal process:
1. For vaults: requestRedeem -> check status -> claimWithdrawal
2. For pools: (to be implemented later)

The action guides users through the withdrawal process, checking withdrawal status and executing the appropriate step.`,
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content?.text?.toLowerCase() || "";

    // Check for withdrawal-related keywords
    const withdrawKeywords = [
      "withdraw",
      "redeem",
      "cash out",
      "exit",
      "claim",
      "liquidate",
      "unstake",
      "get my money",
      "take out",
      "remove funds",
    ];

    const hasWithdrawKeyword = withdrawKeywords.some((keyword) =>
      text.includes(keyword)
    );

    if (!hasWithdrawKeyword) {
      return false;
    }

    // Check if user has positions by getting the Levva service
    try {
      const levvaService = runtime.getService<LevvaService>("levva");
      if (!levvaService) {
        return false;
      }

      // Get user address from message metadata
      const userAddress = (message.metadata as any)?.userAddressId as
        | `0x${string}`
        | undefined;
      if (!userAddress || !isHex(userAddress)) {
        return false;
      }

      // Check if user has any positions
      const positions = await levvaService.getUserPositions(userAddress);
      return positions.length > 0;
    } catch (error) {
      runtime.logger.warn(
        "Error checking user positions in withdraw validate:",
        error
      );
      return false;
    }
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback
  ) => {
    if (!callback) {
      runtime.logger.error("Callback is required for withdraw action");
      return;
    }
    // Get previous action context BEFORE try block for error handling
    const prevActions = await getPreviousReplyContext(runtime, message);

    // Compose state with required providers
    const composedState = await runtime.composeState(message, [
      LEVVA_PROVIDER_NAME,
      WITHDRAW_PARAMS_PROVIDER_NAME,
    ]);

    try {
      const levvaService = runtime.getService<LevvaService>("levva");
      if (!levvaService) {
        const errorContent = await rephrase({
          runtime,
          content: {
            text: "I'm sorry, but the Levva service is not available right now. Please try again later.",
            source: message.content.source,
          },
          state: composedState,
          prevActions,
        });
        await callback(errorContent);

        return {
          text: "Levva service unavailable",
          values: {
            success: false,
            responded: true,
            error: true,
            lastReply: errorContent.text,
            lastReplyTime: Date.now(),
            thoughtProcess: errorContent?.thought,
          },
          data: {
            actionName: "WITHDRAW",
            error: "Levva service not available",
          },
          success: false,
        };
      }

      // Extract parameters from composed state
      const withdrawParamsResult =
        composedState.data?.providers?.[WITHDRAW_PARAMS_PROVIDER_NAME];
      const withdrawParams = withdrawParamsResult?.data;

      if (!withdrawParams) {
        const errorContent = await rephrase({
          runtime,
          content: {
            text: "I need more information to process your withdrawal. Please specify which position you'd like to withdraw from and the amount.",
            source: message.content.source,
          },
          state: composedState,
          prevActions,
        });
        await callback(errorContent);

        return {
          text: "Missing withdrawal parameters",
          values: {
            success: false,
            responded: true,
            error: true,
            lastReply: errorContent.text,
            lastReplyTime: Date.now(),
            thoughtProcess: errorContent?.thought,
          },
          data: {
            actionName: "WITHDRAW",
            error: "Missing withdrawal parameters",
          },
          success: false,
        };
      }

      const { userAddress, strategyId, amount, withdrawalStep, requestId } =
        withdrawParams;

      // Validate user address
      if (!userAddress || !isHex(userAddress)) {
        const errorContent = await rephrase({
          runtime,
          content: {
            text: "I need a valid wallet address to process the withdrawal.",
            source: message.content.source,
          },
          state: composedState,
          prevActions,
        });
        await callback(errorContent);

        return {
          text: "Invalid wallet address",
          values: {
            success: false,
            responded: true,
            error: true,
            lastReply: errorContent.text,
            lastReplyTime: Date.now(),
            thoughtProcess: errorContent?.thought,
          },
          data: {
            actionName: "WITHDRAW",
            error: "Invalid wallet address",
          },
          success: false,
        };
      }

      // Extract chainId from message metadata
      const chainId = ((message.metadata as any)?.chainId as number) || 1;

      runtime.logger.debug(
        `Processing withdrawal: step=${withdrawalStep}, strategyId=${strategyId}, amount=${amount}, requestId=${requestId}`
      );

      // Handle different withdrawal steps
      switch (withdrawalStep) {
        case "request": {
          const content = await handleWithdrawalRequest(
            levvaService,
            userAddress,
            strategyId,
            amount,
            chainId,
            runtime
          );

          const contentObj =
            typeof content === "string" ? { text: content } : content;

          const responseContent = await rephrase({
            runtime,
            content: {
              text: contentObj.text,
              source: message.content.source,
              attachments:
                "attachments" in contentObj
                  ? contentObj.attachments
                  : undefined,
            },
            state: composedState,
            prevActions,
          });

          await callback(responseContent);

          return {
            text: `Generated withdrawal request: ${responseContent?.text}`,
            values: {
              success: true,
              responded: true,
              lastReply: responseContent.text,
              lastReplyTime: Date.now(),
              thoughtProcess: responseContent?.thought,
            },
            data: {
              actionName: "WITHDRAW",
              withdrawalStep: "request",
              strategyId,
              amount,
              chainId,
              userAddress,
              response: responseContent,
            },
            success: true,
          };
        }

        case "check": {
          const content = await handleWithdrawalCheck(
            levvaService,
            userAddress,
            strategyId,
            chainId,
            runtime
          );

          const responseContent = await rephrase({
            runtime,
            content: {
              text: content,
              source: message.content.source,
            },
            state: composedState,
            prevActions,
          });
          await callback(responseContent);

          return {
            text: `Generated withdrawal status check: ${responseContent?.text}`,
            values: {
              success: true,
              responded: true,
              lastReply: responseContent.text,
              lastReplyTime: Date.now(),
              thoughtProcess: responseContent?.thought,
            },
            data: {
              actionName: "WITHDRAW",
              withdrawalStep: "check",
              chainId,
              userAddress,
              response: responseContent,
            },
            success: true,
          };
        }

        case "claim": {
          if (!requestId) {
            const errorContent = await rephrase({
              runtime,
              content: {
                text: "I need the withdrawal request ID to claim your funds. Please check your withdrawal status first.",
                source: message.content.source,
              },
              state: composedState,
              prevActions,
            });
            await callback(errorContent);

            return {
              text: "Missing request ID for claim",
              values: {
                success: false,
                responded: true,
                error: true,
                lastReply: errorContent.text,
                lastReplyTime: Date.now(),
                thoughtProcess: errorContent?.thought,
              },
              data: {
                actionName: "WITHDRAW",
                withdrawalStep: "claim",
                error: "Missing request ID",
              },
              success: false,
            };
          }

          const content = await handleWithdrawalClaim(
            levvaService,
            userAddress,
            requestId,
            chainId,
            runtime
          );

          const contentObj =
            typeof content === "string" ? { text: content } : content;

          const responseContent = await rephrase({
            runtime,
            content: {
              text: contentObj.text,
              source: message.content.source,
              attachments:
                "attachments" in contentObj
                  ? contentObj.attachments
                  : undefined,
            },
            state: composedState,
            prevActions,
          });
          await callback(responseContent);

          return {
            text: `Generated withdrawal claim: ${responseContent?.text}`,
            values: {
              success: true,
              responded: true,
              lastReply: responseContent.text,
              lastReplyTime: Date.now(),
              thoughtProcess: responseContent?.thought,
            },
            data: {
              actionName: "WITHDRAW",
              withdrawalStep: "claim",
              requestId,
              chainId,
              userAddress,
              response: responseContent,
            },
            success: true,
          };
        }

        default: {
          // Auto-detect the appropriate step
          const content = await autoDetectWithdrawalStep(
            levvaService,
            userAddress,
            strategyId,
            amount,
            chainId,
            runtime
          );

          const contentObj =
            typeof content === "string" ? { text: content } : content;

          const responseContent = await rephrase({
            runtime,
            content: {
              text: contentObj.text,
              source: message.content.source,
              attachments:
                "attachments" in contentObj
                  ? contentObj.attachments
                  : undefined,
            },
            state: composedState,
            prevActions,
          });
          await callback(responseContent);

          return {
            text: `Generated withdrawal guidance: ${responseContent?.text}`,
            values: {
              success: true,
              responded: true,
              lastReply: responseContent.text,
              lastReplyTime: Date.now(),
              thoughtProcess: responseContent?.thought,
            },
            data: {
              actionName: "WITHDRAW",
              withdrawalStep: "auto-detect",
              strategyId,
              amount,
              chainId,
              userAddress,
              response: responseContent,
            },
            success: true,
          };
        }
      }
    } catch (error) {
      runtime.logger.error("Error in withdraw action:", error);
      const errorMessage = (error as Error).message ?? "unknown error";

      const errorContent = await rephrase({
        runtime,
        content: {
          text: "I encountered an error while processing your withdrawal request. Please try again or contact support if the issue persists.",
          source: message.content.source,
        },
        state: composedState,
        prevActions,
      });
      await callback(errorContent);

      return {
        text: `Error processing withdrawal: ${errorMessage}`,
        values: {
          success: false,
          responded: true,
          error: true,
          lastReply: errorContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: errorContent?.thought,
        },
        data: {
          actionName: "WITHDRAW",
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
          text: "I want to withdraw 100 USDC from my safe yield strategy",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll help you withdraw 100 USDC from your safe yield strategy. Let me initiate the withdrawal request for you.",
          action: "WITHDRAW",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Can I cash out all my funds from strategy 1?",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll help you withdraw all your funds from Strategy 1. Let me check your current balance and initiate the withdrawal process.",
          action: "WITHDRAW",
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
        name: "{{agentName}}",
        content: {
          text: "Let me check the status of your withdrawal requests and see if any are ready to be claimed.",
          action: "WITHDRAW",
        },
      },
    ],
  ] as ActionExample[][],
};

/**
 * Handle initial withdrawal request (step 1: requestRedeem)
 */
async function handleWithdrawalRequest(
  levvaService: LevvaService,
  userAddress: `0x${string}`,
  strategyId: number,
  amount: number,
  chainId: number,
  runtime: IAgentRuntime
): Promise<string | { text: string; attachments: any[] }> {
  try {
    // Get user positions to validate the withdrawal
    const positions = await levvaService.getUserPositions(userAddress);
    const position = positions.find((p) => p.strategyId === strategyId);

    if (!position) {
      return `You don't have any funds in Strategy ${strategyId}. Please check your positions and try again.`;
    }

    if (amount > position.balance) {
      return `You're trying to withdraw ${amount} but only have ${position.balance} available in Strategy ${strategyId}. Please adjust the amount.`;
    }

    // Get strategy details for vault information
    const strategiesResult = await getStrategiesApi(chainId);
    if (!strategiesResult.success) {
      return "Unable to retrieve strategy information. Please try again later.";
    }
    const strategy = strategiesResult.data.find((s) => s.id === strategyId);

    if (!strategy?.vault) {
      return `Strategy ${strategyId} doesn't support withdrawals yet. Currently, only vault-based strategies support withdrawals.`;
    }

    // For pools (future implementation)
    if (strategy.category === "Pool") {
      return `Pool withdrawals are not yet implemented. Strategy ${strategyId} is a pool-based strategy. Vault withdrawals will be available soon!`;
    }

    // Generate withdrawal transaction for vault
    const vaultAddress = strategy.vault.address as `0x${string}`;

    // Convert amount to shares (simplified - in real implementation, you'd need to calculate shares)
    const shares = Math.floor(amount * 1e6); // Assuming 6 decimals for simplification

    const calldataWithDescription = [
      {
        to: vaultAddress,
        data: levvaService.encodeRequestRedeem(BigInt(shares)),
        value: "0",
        title: `Withdraw ${amount} from ${strategy.name}`,
        description: `Request withdrawal of ${amount} tokens from ${strategy.name} vault. This will initiate the withdrawal process and you'll receive a request ID.`,
      },
    ];

    const calldataHash = await levvaService.createCalldata(
      calldataWithDescription
    );

    return {
      text: `Ready to initiate withdrawal of ${amount} from ${strategy.name}!

**Step 1: Request Withdrawal**
Please sign this transaction to request your withdrawal.

After signing, you'll receive a request ID. The withdrawal will need to be processed (usually takes a few minutes to hours), then you can claim your funds.

Would you like me to check the status of your withdrawal requests?`,
      attachments: [
        {
          id: "withdrawal-request.json",
          url: `/api/calldata?hash=${calldataHash}`,
        },
      ],
    };
  } catch (error) {
    runtime.logger.error("Error handling withdrawal request:", error);
    return "I encountered an error while preparing your withdrawal request. Please try again.";
  }
}

/**
 * Handle withdrawal status check (step 2: check isFinalized)
 */
async function handleWithdrawalCheck(
  levvaService: LevvaService,
  userAddress: `0x${string}`,
  strategyId: number | undefined,
  chainId: number,
  runtime: IAgentRuntime
): Promise<string> {
  try {
    const withdrawalRequests = await levvaService.getWithdrawalRequests(
      userAddress,
      chainId
    );

    if (withdrawalRequests.length === 0) {
      return "You don't have any withdrawal requests. Would you like to initiate a new withdrawal?";
    }

    // Filter by strategy if specified
    const relevantRequests = strategyId
      ? withdrawalRequests.filter((req) => req.strategyId === strategyId)
      : withdrawalRequests;

    if (relevantRequests.length === 0) {
      return `No withdrawal requests found${strategyId ? ` for Strategy ${strategyId}` : ""}. Would you like to initiate a new withdrawal?`;
    }

    const pendingRequests = relevantRequests.filter((req) => !req.isFinalized);
    const readyRequests = relevantRequests.filter((req) => req.isFinalized);

    let statusMessage = "**Withdrawal Status:**\n\n";

    if (pendingRequests.length > 0) {
      statusMessage += "**⏳ Pending Requests:**\n";
      pendingRequests.forEach((req) => {
        statusMessage += `- Request #${req.requestId}: ${req.amount} tokens from Strategy ${req.strategyId} (Processing...)\n`;
      });
      statusMessage += "\n";
    }

    if (readyRequests.length > 0) {
      statusMessage += "**✅ Ready to Claim:**\n";
      readyRequests.forEach((req) => {
        statusMessage += `- Request #${req.requestId}: ${req.amount} tokens from Strategy ${req.strategyId} (Ready!)\n`;
      });
      statusMessage += "\n";

      if (readyRequests.length === 1) {
        statusMessage += `Your withdrawal request #${readyRequests[0].requestId} is ready! Would you like me to help you claim it?`;
      } else {
        statusMessage += `You have ${readyRequests.length} withdrawal requests ready to claim! Would you like me to help you claim them?`;
      }
    } else if (pendingRequests.length > 0) {
      statusMessage +=
        "Your withdrawal requests are still being processed. Please check back in a few minutes.";
    }

    return statusMessage;
  } catch (error) {
    runtime.logger.error("Error checking withdrawal status:", error);
    return "I encountered an error while checking your withdrawal status. Please try again.";
  }
}

/**
 * Handle withdrawal claim (step 3: claimWithdrawal)
 */
async function handleWithdrawalClaim(
  levvaService: LevvaService,
  userAddress: `0x${string}`,
  requestId: number,
  chainId: number,
  runtime: IAgentRuntime
): Promise<string | { text: string; attachments: any[] }> {
  try {
    const withdrawalRequests = await levvaService.getWithdrawalRequests(
      userAddress,
      chainId
    );

    const request = withdrawalRequests.find(
      (req) => req.requestId === requestId
    );

    if (!request) {
      return `Withdrawal request #${requestId} not found. Please check your request ID.`;
    }

    if (!request.isFinalized) {
      return `Withdrawal request #${requestId} is not ready yet. Please wait for it to be processed before claiming.`;
    }

    // Generate claim transaction
    const calldataWithDescription = [
      {
        to: request.withdrawalNftAddress as `0x${string}`,
        data: levvaService.encodeClaimWithdrawal(requestId, userAddress),
        value: "0",
        title: `Claim Withdrawal Request #${requestId}`,
        description: `Claim withdrawal of ${request.amount} tokens from request #${requestId}. This will transfer the funds to your wallet.`,
      },
    ];

    const calldataHash = await levvaService.createCalldata(
      calldataWithDescription
    );

    return {
      text: `Ready to claim your withdrawal!

**Step 3: Claim Withdrawal**
Request #${requestId} for ${request.amount} tokens is ready to be claimed.

Please sign this transaction to claim your funds.

After signing, you'll receive your withdrawn funds directly to your wallet.`,
      attachments: [
        {
          id: "withdrawal-claim.json",
          url: `/api/calldata?hash=${calldataHash}`,
        },
      ],
    };
  } catch (error) {
    runtime.logger.error("Error handling withdrawal claim:", error);
    return "I encountered an error while preparing your withdrawal claim. Please try again.";
  }
}

/**
 * Auto-detect the appropriate withdrawal step
 */
async function autoDetectWithdrawalStep(
  levvaService: LevvaService,
  userAddress: `0x${string}`,
  strategyId: number | undefined,
  amount: number | undefined,
  chainId: number,
  runtime: IAgentRuntime
): Promise<string | { text: string; attachments: any[] }> {
  try {
    const withdrawalRequests = await levvaService.getWithdrawalRequests(
      userAddress,
      chainId
    );

    // Check if there are any ready-to-claim requests
    const readyRequests = withdrawalRequests.filter((req) => req.isFinalized);

    if (readyRequests.length > 0) {
      // If there are ready requests, suggest claiming
      return await handleWithdrawalCheck(
        levvaService,
        userAddress,
        strategyId,
        chainId,
        runtime
      );
    }

    // Check if there are pending requests
    const pendingRequests = withdrawalRequests.filter(
      (req) => !req.isFinalized
    );

    if (pendingRequests.length > 0 && !strategyId && !amount) {
      // If there are pending requests and no new withdrawal specified, show status
      return await handleWithdrawalCheck(
        levvaService,
        userAddress,
        strategyId,
        chainId,
        runtime
      );
    }

    // If no pending/ready requests, or user specified new withdrawal, initiate new request
    if (strategyId && amount) {
      return await handleWithdrawalRequest(
        levvaService,
        userAddress,
        strategyId,
        amount,
        chainId,
        runtime
      );
    }

    // If no specific parameters, show general guidance
    const positions = await levvaService.getUserPositions(userAddress);

    if (positions.length === 0) {
      return "You don't have any active positions to withdraw from. Would you like to explore investment strategies instead?";
    }

    let message =
      "I can help you withdraw from your positions. Here's what you have:\n\n";

    positions.forEach((pos) => {
      message += `- Strategy ${pos.strategyId}: $${pos.balanceUsd.toFixed(2)} (${pos.balance} tokens)`;
      if (pos.hasPendingWithdrawals) {
        message += " - Has pending withdrawals";
      }
      message += "\n";
    });

    message +=
      "\nPlease specify which strategy and how much you'd like to withdraw, or ask me to check your withdrawal status.";

    return message;
  } catch (error) {
    runtime.logger.error("Error auto-detecting withdrawal step:", error);
    return "I encountered an error while checking your withdrawal options. Please try again.";
  }
}

export const suggest: Suggestion[] = [
  {
    name: "withdrawal-status-check",
    description:
      "Check withdrawal status and suggest next steps when user has pending withdrawals",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision }
    ) => {
      return withdrawalStatusCheckPrompt(runtime, {
        address,
        chainId,
        conversation,
        decision,
      });
    },
  },
  {
    name: "withdrawal-guidance",
    description:
      "Provide withdrawal guidance when user wants to exit positions",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision }
    ) => {
      return withdrawalGuidancePrompt(runtime, {
        address,
        chainId,
        conversation,
        decision,
      });
    },
  },
];
