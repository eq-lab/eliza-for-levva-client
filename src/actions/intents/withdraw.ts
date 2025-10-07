import {
  Content,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionResult,
  UUID,
} from "@elizaos/core";
import { getAddress, isHex, parseUnits, TransactionReceipt } from "viem";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../../providers";
import { selectProviderState } from "../../providers/util";
import {
  POSITION_PARAMS_PROVIDER_NAME,
  PositionParamsProviderData,
} from "../../providers/position-params";
import { LevvaService } from "../../services/levva/class";
import { rephrase } from "../../util/generate";
import { IntentContext, IntentHandler } from "../../services/intent-manager";
import { ExtractedDataForWithdraw } from "../../prompts/withdraw";
import { WithdrawalRequest } from "../../api/levva/schema";
import { StrategyEntry } from "../../services/levva/pool";
import { CalldataWithDescription } from "../../types/tx";
import { generateWithdrawIntentSuggestionsPrompt } from "../../prompts/suggest/withdraw-intent";

export interface WithdrawData extends ExtractedDataForWithdraw {
  [key: string]: any;
}

export function formatWithdrawIntent(data: WithdrawData): string {
  const {
    strategyId,
    strategyName,
    strategyRisk,
    amount,
    withdrawalStep,
    confidence,
    thought,
  } = data || {};

  // Strategy formatting
  let strategyLine = "[Not specified]";
  const parts: string[] = [];
  if (Number.isFinite(strategyId)) parts.push(`ID: ${strategyId}`);
  if (strategyName) parts.push(`Name: ${strategyName}`);
  if (strategyRisk) parts.push(`Risk: ${strategyRisk}`);
  if (parts.length) strategyLine = parts.join(", ");

  // Amount formatting
  const amountLine =
    typeof amount === "number" || amount === "all"
      ? String(amount)
      : "[Not specified]";

  // Step formatting
  const stepLine = withdrawalStep ?? "[Not specified]";

  // Missing parameters detection (contextual by step)
  const missing: string[] = [];
  if (!Number.isFinite(strategyId) && !strategyName && !strategyRisk) {
    missing.push("strategy");
  }
  if (
    (withdrawalStep === "request" || withdrawalStep === undefined) &&
    amount === undefined
  ) {
    missing.push("amount");
  }

  const status = missing.length === 0 ? "complete" : "needsMoreInfo";
  const missingLine =
    missing.length > 0 ? `\n- Missing Parameters: ${missing.join(", ")}` : "";

  const confidenceLine =
    typeof confidence === "number"
      ? `\n- Confidence: ${(confidence * 100).toFixed(0)}%`
      : "";
  const thoughtLine = thought ? `\n- Note: ${thought}` : "";

  return `### Withdraw Intent

- Strategy: ${strategyLine}
- Amount: ${amountLine}
- Step: ${stepLine}
- Status: ${status}${missingLine}${confidenceLine}${thoughtLine}`;
}

async function handleRequestRedeem(
  runtime: IAgentRuntime,
  address: `0x${string}`,
  strategy: StrategyEntry,
  amount: string
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
    // amount is already a string after type standardization
    amountOut = parseUnits(amount, lpToken.decimals);
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
        url: `/api/levva/calldata?hash=${calldataHash}`,
      },
    ],
  };

  return content;
}

async function handleClaimWithdrawal(
  runtime: IAgentRuntime,
  address: `0x${string}`,
  strategy: StrategyEntry,
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

  if (!isHex(withdrawal.withdrawalNftAddress)) {
    throw new Error(
      `Incorrect withdrawal NFT address for strategy ${strategy.id}`
    );
  }

  const calldata: CalldataWithDescription = {
    to: withdrawal.withdrawalNftAddress,
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
        url: `/api/levva/calldata?hash=${calldataHash}`,
      },
    ],
  };
}

/**
 * Generate withdraw intent-aware suggestions
 * This function is registered with the intent and called by IntentManager
 */
export async function generateWithdrawSuggestions(params: {
  runtime: IAgentRuntime;
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
}): Promise<string> {
  const { runtime, intentContext, conversation, userAddress, chainId } = params;
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("LevvaService not found");
  }

  // Fetch all required data in parallel
  const [positions, strategies, withdrawalRequests] = await Promise.all([
    service.getUserPositions(userAddress, chainId),
    service.strategy.getStrategies(chainId),
    service.getWithdrawalRequests(userAddress, chainId),
  ]);

  // Generate prompt using consolidated prompt function
  return generateWithdrawIntentSuggestionsPrompt({
    intentContext,
    conversation,
    userAddress,
    chainId,
    returnData: intentContext.returnData || {},
    positions: positions.map((p) => ({
      strategyId: p.strategyId,
      balance: p.balance,
      balanceUsd: p.balanceUsd,
    })),
    strategies: strategies.map((s) => ({
      id: s.id,
      name: s.name,
      risk: s.risk,
    })),
    withdrawalRequests: withdrawalRequests.map((req) => ({
      strategyId: req.strategyId,
      status: req.isFinalized ? "READY_TO_CLAIM" : "PENDING",
    })),
  });
}

export const handleWithdrawIntent: IntentHandler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> => {
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
  const withdrawParams = intentContext.returnData as WithdrawData;

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

  const { strategy, strategyId, amount, withdrawalStep } = withdrawParams;

  if (!strategyId || !strategy) {
    // Show available positions to help user choose
    const positionsSummary = params?.positionsSummary || "No active positions found";
    const totalValue = params?.totalPositionValue 
      ? `\n**Total Portfolio Value**: $${params.totalPositionValue.toFixed(2)}`
      : "";

    const errorContent = await rephrase({
      runtime,
      content: {
        text: `I see you want to withdraw from a position. Here are your available positions:\n\n${positionsSummary}${totalValue}\n\nPlease specify which position you'd like to withdraw from (by strategy name or number).`,
        source: message.content.source,
      },
      // state,
      prevActions,
    });

    await callback(errorContent);

    return {
      text: "Generated withdrawal parameter request with positions",
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
        showedPositions: true,
      },
    };
  }

  // should not happen because matched in provider
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

          // todo invalidate before check
          if (strategy.vault?.publicChainId) {
            await service.invalidateWithdrawalRequestsCache(
              address,
              strategy.vault.publicChainId
            );
          }

          result = {
            thought: `I need to display withdrawal status`,
            text: `### Your withdrawal
${withdrawal.amount} tokens from ${strategy.name}
${withdrawal.isFinalized ? "Ready to claim" : "Processing..."}
NFT Address: ${withdrawal.withdrawalNftAddress}`,
          };
        }
        break;
      case "claim": {
        if (!withdrawal) {
          throw new Error(`Withdrawal not found(strategyId: ${strategyId})`);
        }

        result = await handleClaimWithdrawal(
          runtime,
          address,
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
};

// TODO oncomplete handlers
// do not call completeIntent if resolved to false
export async function onWithdrawSuccess(
  runtime: IAgentRuntime,
  intentContext: IntentContext,
  receipt: TransactionReceipt
): Promise<boolean> {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  const { returnData, userId } = intentContext;
  const strategyId = returnData?.strategyId;

  if (!Number.isFinite(strategyId)) {
    throw new Error("Strategy ID not found");
  }

  const strategies = await service.strategy.getStrategies();
  const strategy = strategies.find((s) => s.id === strategyId);

  if (!strategy) {
    throw new Error(`Strategy(id=${strategyId}) not found`);
  }

  const chainId = strategy.vaultChainId;
  const user = await service.getUserById(userId as UUID); // todo checkUUID
  const address = user?.address;

  if (!isHex(address)) {
    throw new Error("Invalid address");
  }

  await Promise.all([
    service.invalidateUserPositionsCache(address),
    service.invalidateWithdrawalRequestsCache(address, chainId),
  ]);

  const request = (await service.getWithdrawalRequests(address, chainId)).find(
    (r) => r.strategyId === strategyId
  );

  if (!request) {
    throw new Error(`Withdrawal request not found(strategyId=${strategyId})`);
  }

  // run complete only on final step
  const shouldComplete = receipt.contractAddress
    ? getAddress(receipt.contractAddress) ===
      getAddress(request.withdrawalNftAddress)
    : false;

  return shouldComplete;
}
