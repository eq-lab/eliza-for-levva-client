import {
  Content,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionResult,
} from "@elizaos/core";
import { isHex, parseUnits } from "viem";
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
import { StrategiesResponse, WithdrawalRequest } from "../../api/levva/schema";
import { CalldataWithDescription } from "../../types/tx";

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
        url: `/api/calldata?hash=${calldataHash}`,
      },
    ],
  };
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

  const { strategyId, amount, withdrawalStep } = withdrawParams;

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
