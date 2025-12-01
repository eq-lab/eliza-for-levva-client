import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import {
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type Content,
} from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../../providers";
import { LevvaService } from "../../services/levva/class";
import { CalldataWithDescription } from "../../types/tx";
import { rephrase } from "../../util/generate";
import { IntentContext, IntentHandler } from "../../services/intent-manager";
import { ActionResult } from "../../util/action-results";
import { ETH_NULL_ADDR } from "../../constants/eth";
import { selectProviderState } from "../../providers/util";
import {
  PENDLE_PARAMS_PROVIDER_NAME,
  PendleParamsProviderData,
} from "../../providers/pendle-params";
import { generatePendleStrategyIntentSuggestionsPrompt } from "../../prompts/suggest/pendle-intent";
import { getPendleConvert } from "../../api/pendle";

/**
 * Generate suggestions for Pendle strategy intent
 */
export async function generatePendleStrategySuggestions(params: {
  runtime: IAgentRuntime;
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
  state?: State;
}): Promise<string> {
  const { runtime, intentContext, conversation, userAddress, chainId, state } =
    params;
  const levvaService = runtime.getService<LevvaService>(
    LEVVA_SERVICE.LEVVA_COMMON
  );

  if (!levvaService) {
    throw new Error("LevvaService not found");
  }

  const providerData = selectProviderState<PendleParamsProviderData>(
    PENDLE_PARAMS_PROVIDER_NAME,
    state
  );

  const walletTokenData =
    providerData?.operationType === "buy" ||
    providerData?.operationType === "deposit"
      ? providerData?.userTokenData
      : providerData?.pendleTokenData;

  const balanceData = walletTokenData
    ? await levvaService.wallet.getBalanceOf(
        userAddress,
        chainId,
        walletTokenData.address!
      )
    : undefined;

  const walletAsset = balanceData
    ? {
        address: walletTokenData!.address!,
        decimals: walletTokenData!.decimals,
        balance: balanceData.amount,
      }
    : undefined;

  const allPendleMarkets = await levvaService.getPendleMarkets(chainId);

  // Generate prompt using consolidated prompt function
  return generatePendleStrategyIntentSuggestionsPrompt({
    intentContext,
    conversation,
    userAddress,
    chainId,
    returnData: intentContext.returnData || {},
    providerData: providerData,
    walletAsset,
    pendleFilteredMarkets: providerData?.pendleFilteredMarkets ?? [],
    allPendleMarkets,
    walletSupportedPendleMarketTokenSymbols:
      providerData?.walletSupportedPendleMarketTokenSymbols,
  });
}

/**
 * Pendle strategy Intent Handler
 *
 * Handles Pendle strategy operations with intent context tracking.
 */
export const handlePendleStrategyIntent: IntentHandler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> => {
  try {
    runtime.logger.info("Handling Pendle strategy intent", {
      intentId: intentContext.id,
      intentType: intentContext.type,
    });

    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      throw new Error("Failed to get levva service, disable action");
    }

    if (!callback) {
      throw new Error("Callback not found, disable action");
    }

    if (!state) {
      throw new Error("State not found, disable action");
    }

    // Handle both composedState (from action) and regular state (from IntentManager)
    const levvaProviderState = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      state
    );

    const params = selectProviderState<PendleParamsProviderData>(
      PENDLE_PARAMS_PROVIDER_NAME,
      state
    );

    if (!levvaProviderState?.user) {
      throw new Error("User address ID is required");
    }

    if (!params) {
      throw new Error(
        `Failed to get provider(${PENDLE_PARAMS_PROVIDER_NAME}) results`
      );
    }

    // Check if we have all required parameters
    if (
      !params.operationType ||
      !params.userTokenData ||
      !params.pendleTokenData ||
      !params.amount ||
      !params.pendleMarketAddress ||
      params.walletSupportedPendleMarketTokenSymbols
    ) {
      // Missing parameters - ask user for more information
      return await handleMissingPendleStrategyParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        prevActions
      );
    }

    // All parameters available - execute the Pendle strategy
    return await executePendleStrategyTransaction(
      runtime,
      message,
      state,
      callback,
      intentContext,
      params,
      levvaProviderState,
      service,
      prevActions
    );
  } catch (error) {
    runtime.logger.error("Error in Pendle strategy intent handler:", error);
    return await handlePendleStrategyError(
      runtime,
      message,
      state,
      callback,
      intentContext,
      error as Error,
      prevActions
    );
  }
};

/**
 * Handle case where Pendle strategy parameters are missing
 */
async function handleMissingPendleStrategyParameters(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> {
  runtime.logger.info(
    "Missing Pendle strategy parameters, asking user for input",
    {
      intentId: intentContext.id,
    }
  );

  if (!state.values.strategy) {
    throw new Error("Failed to get Pendle strategy parameters");
  }

  const content: Content = {
    thought:
      "Need to ask user for missing Pendle strategy parameters to continue the intent",
    text: state.values.strategy,
    actions: [`${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`],
    source: message.content.source,
  };

  const responseContent = await rephrase({
    runtime,
    content,
    state,
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
      actionName: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
      intentId: intentContext.id,
      intentType: intentContext.type,
      response: responseContent,
      thought: responseContent?.thought,
      initialReply: content.text,
      initialThought: content.thought,
      messageGenerated: true,
      awaitingUserInput: true,
    },
    success: true,
  };
}

/**
 * Execute the Pendle strategy transaction with all parameters available
 */
async function executePendleStrategyTransaction(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  params: PendleParamsProviderData,
  levvaProviderState: LevvaProviderState,
  levvaService: LevvaService,
  prevActions?: any
): Promise<ActionResult> {
  const {
    userTokenData,
    pendleTokenData,
    pendleMarketAddress,
    amount,
    operationType,
    slippage,
  } = params;

  runtime.logger.info("Executing Pendle strategy transaction", {
    intentId: intentContext.id,
    operationType,
    amount,
    tokenInSymbol: userTokenData?.symbol,
    pendleMarketAddress: pendleMarketAddress,
  });

  const amountUnits = parseUnits(amount!, userTokenData!.decimals);
  let calldata: CalldataWithDescription[] = [];
  let thought: string;
  let text: string;

  switch (operationType) {
    case "buy": {
      const convert = await getPendleConvert({
        receiver: levvaProviderState.user!.address as `0x${string}`,
        chainId: `${levvaProviderState.chainId}`,
        tokensIn: userTokenData!.address! as `0x${string}`,
        tokensOut: pendleTokenData!.address! as `0x${string}`,
        amountsIn: `${amountUnits}`,
        slippage: slippage as `${number}`,
        enableAggregator: "true",
      });

      if (!convert || !convert.routes || convert.routes.length === 0) {
        throw new Error("Failed to get Pendle swap details. Try again later.");
      }

      const route = convert.routes[0].tx;

      if (convert.requiredApprovals.length > 0) {
        for (const approval of convert.requiredApprovals) {
          calldata.push({
            to: approval.token as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [route.to as `0x${string}`, BigInt(approval.amount)],
            }),
            title: `Approve ${formatUnits(BigInt(approval.amount), userTokenData!.decimals!)} ${userTokenData!.symbol!}`,
            description: `Approve spending ${formatUnits(BigInt(approval.amount), userTokenData!.decimals!)} ${userTokenData!.symbol!} to ${pendleTokenData!.symbol!}`,
          });
        }
      }

      calldata.push({
        to: route.to as `0x${string}`,
        data: route.data as `0x${string}`,
        value: route.value,
        title: `Swap ${amount} ${userTokenData!.symbol} to ${pendleTokenData!.symbol!}`,
        description: `Swap ${amount!} ${userTokenData!.symbol} to ${pendleTokenData!.symbol!}`,
      });

      const description =
        calldata.length > 1
          ? `### Transaction steps\n${calldata.map((c, i) => `${i + 1}. ${c.description}`).join("\n")}`
          : calldata[0].description;
      thought = `Prepared Pendle strategy transaction for intent ${intentContext.id}: ${operationType} ${pendleTokenData!.symbol!} for ${amount} ${userTokenData!.symbol!}`;
      text = `${description}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    case "deposit": {
      const convert = await getPendleConvert({
        receiver: levvaProviderState.user!.address as `0x${string}`,
        chainId: `${levvaProviderState.chainId}`,
        tokensIn: userTokenData!.address! as `0x${string}`,
        tokensOut: pendleMarketAddress! as `0x${string}`,
        amountsIn: `${amountUnits}`,
        slippage: slippage as `${number}`,
        enableAggregator: "true",
      });

      if (!convert || !convert.routes || convert.routes.length === 0) {
        throw new Error("Failed to get Pendle swap details. Try again later.");
      }

      const route = convert.routes[0].tx;

      if (convert.requiredApprovals.length > 0) {
        for (const approval of convert.requiredApprovals) {
          calldata.push({
            to: approval.token as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [route.to as `0x${string}`, BigInt(approval.amount)],
            }),
            title: `Approve ${formatUnits(BigInt(approval.amount), userTokenData!.decimals!)} ${userTokenData!.symbol!}`,
            description: `Approve spending ${formatUnits(BigInt(approval.amount), userTokenData!.decimals!)} ${userTokenData!.symbol!} to ${pendleTokenData!.symbol!}`,
          });
        }
      }

      calldata.push({
        to: route.to as `0x${string}`,
        data: route.data as `0x${string}`,
        value: route.value,
        title: `Provide liquidity ${amount} ${userTokenData!.symbol} to ${pendleTokenData!.symbol!} Pendle pool`,
        description: `Provide liquidity ${amount!} ${userTokenData!.symbol} to ${pendleTokenData!.symbol!} Pendle pool`,
      });

      const description =
        calldata.length > 1
          ? `### Transaction steps\n${calldata.map((c, i) => `${i + 1}. ${c.description}`).join("\n")}`
          : calldata[0].description;
      thought = `Prepared Pendle strategy transaction for intent ${intentContext.id}: ${operationType} to ${pendleTokenData!.symbol!} Pendle pool for ${amount} ${userTokenData!.symbol!}`;
      text = `${description}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    case "sell": {
      const convert = await getPendleConvert({
        receiver: levvaProviderState.user!.address as `0x${string}`,
        chainId: `${levvaProviderState.chainId}`,
        tokensIn: pendleTokenData!.address! as `0x${string}`,
        tokensOut: userTokenData!.address! as `0x${string}`,
        amountsIn: `${amountUnits}`,
        slippage: slippage as `${number}`,
        enableAggregator: "true",
      });

      if (!convert || !convert.routes || convert.routes.length === 0) {
        throw new Error("Failed to get Pendle swap details. Try again later.");
      }

      const route = convert.routes[0].tx;

      if (convert.requiredApprovals.length > 0) {
        for (const approval of convert.requiredApprovals) {
          calldata.push({
            to: approval.token as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [route.to as `0x${string}`, BigInt(approval.amount)],
            }),
            title: `Approve ${formatUnits(BigInt(approval.amount), pendleTokenData!.decimals!)} PT ${pendleTokenData!.symbol!}`,
            description: `Approve spending ${formatUnits(BigInt(approval.amount), pendleTokenData!.decimals!)} PT ${pendleTokenData!.symbol!} to ${userTokenData!.symbol!}`,
          });
        }
      }

      calldata.push({
        to: route.to as `0x${string}`,
        data: route.data as `0x${string}`,
        value: route.value,
        title: `Swap ${amount} PT ${pendleTokenData!.symbol} to ${userTokenData!.symbol}`,
        description: `Swap ${amount!} PT ${pendleTokenData!.symbol} to ${userTokenData!.symbol}`,
      });

      const description =
        calldata.length > 1
          ? `### Transaction steps\n${calldata.map((c, i) => `${i + 1}. ${c.description}`).join("\n")}`
          : calldata[0].description;
      thought = `Prepared Pendle strategy transaction for intent ${intentContext.id}: ${operationType} PT ${pendleTokenData!.symbol!} for ${amount} ${userTokenData!.symbol!}`;
      text = `${description}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    case "withdraw": {
      const convert = await getPendleConvert({
        receiver: levvaProviderState.user!.address as `0x${string}`,
        chainId: `${levvaProviderState.chainId}`,
        tokensIn: pendleTokenData!.address! as `0x${string}`,
        tokensOut: userTokenData!.address! as `0x${string}`,
        amountsIn: `${amountUnits}`,
        slippage: slippage as `${number}`,
        enableAggregator: "true",
      });

      if (!convert || !convert.routes || convert.routes.length === 0) {
        throw new Error("Failed to get Pendle swap details. Try again later.");
      }

      const route = convert.routes[0].tx;

      if (convert.requiredApprovals.length > 0) {
        for (const approval of convert.requiredApprovals) {
          calldata.push({
            to: approval.token as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [route.to as `0x${string}`, BigInt(approval.amount)],
            }),
            title: `Approve ${formatUnits(BigInt(approval.amount), pendleTokenData!.decimals!)} PT ${pendleTokenData!.symbol!}`,
            description: `Approve spending ${formatUnits(BigInt(approval.amount), pendleTokenData!.decimals!)} PT ${pendleTokenData!.symbol!} to ${userTokenData!.symbol!}`,
          });
        }
      }

      calldata.push({
        to: route.to as `0x${string}`,
        data: route.data as `0x${string}`,
        value: route.value,
        title: `Withdraw liquidity ${amount} LP ${pendleTokenData!.symbol} to ${userTokenData!.symbol}`,
        description: `Withdraw liquidity ${amount!} LP ${pendleTokenData!.symbol} to ${userTokenData!.symbol}`,
      });

      const description =
        calldata.length > 1
          ? `### Transaction steps\n${calldata.map((c, i) => `${i + 1}. ${c.description}`).join("\n")}`
          : calldata[0].description;
      thought = `Prepared Pendle strategy transaction for intent ${intentContext.id}: ${operationType} LP ${pendleTokenData!.symbol!} for ${amount} ${userTokenData!.symbol!}`;
      text = `${description}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    default:
      throw new Error(`Unknown Pendle strategy type: ${operationType}`);
  }

  const hash = await levvaService.createCalldata(calldata);

  const json = {
    id: "calls.json",
    url: `/api/levva/calldata?hash=${hash}`,
  };

  const content: Content = {
    thought,
    text,
    actions: [`${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`],
    source: message.content.source,
    attachments: [json],
  };

  const responseContent = await rephrase({
    runtime,
    content,
    state,
    prevActions,
  });
  await callback(responseContent);

  return {
    text: `Generated calldata accessible at ${json.url}, generated text: ${responseContent?.text}`,
    values: {
      success: true,
      responded: true,
      lastReply: responseContent.text,
      lastReplyTime: Date.now(),
      thoughtProcess: responseContent?.thought,
    },
    data: {
      actionName: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
      intentId: intentContext.id,
      intentType: intentContext.type,
      response: responseContent,
      thought: responseContent?.thought,
      initialReply: content.text,
      initialThought: content.thought,
      messageGenerated: true,
      transactionPrepared: true,
      calldataHash: hash,
      pendleStrategyDetails: {
        operationType,
        amount,
        tokenIn: userTokenData,
        pendleMarketAddress: pendleMarketAddress,
      },
    },
    success: true,
  };
}

/**
 * Handle Pendle strategy errors with intent context
 */
async function handlePendleStrategyError(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  error: Error,
  prevActions?: any
): Promise<ActionResult> {
  runtime.logger.error("Pendle strategy intent error", {
    intentId: intentContext.id,
    error: error.message,
  });

  const errorMessage = error.message ?? "unknown error";
  const thought = `Pendle strategy intent ${intentContext.id} failed with error: ${errorMessage}. I should tell the user about the error.`;
  const text = `Failed to prepare Pendle strategy transaction, reason: ${errorMessage}. Please try again.`;

  const responseContent = await rephrase({
    runtime,
    content: {
      text,
      thought,
      actions: [`${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`],
      source: message.content.source,
    },
    state: state!,
    prevActions,
  });

  await callback?.(responseContent);

  return {
    text: `Error generating Pendle strategy transaction: ${errorMessage}.`,
    values: {
      success: false,
      responded: true,
      error: true,
      lastReply: responseContent.text,
      lastReplyTime: Date.now(),
      thoughtProcess: responseContent?.thought,
    },
    data: {
      actionName: `${LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY}`,
      intentId: intentContext.id,
      intentType: intentContext.type,
      error: errorMessage,
      thought: responseContent?.thought,
    },
    success: false,
    error: error,
  };
}

/**
 * Pendle strategy completion handler for evaluators
 * Called when a Pendle strategy transaction is confirmed
 */
export const onPendleStrategySuccess = async (
  runtime: IAgentRuntime,
  intentContext: IntentContext,
  transactionReceipt: any
): Promise<boolean> => {
  try {
    runtime.logger.info("Pendle strategy transaction completed successfully", {
      intentId: intentContext.id,
      transactionHash: transactionReceipt.transactionHash,
    });

    // Invalidate user balances cache after successful swap
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (
      service &&
      intentContext.metadata?.userAddress &&
      intentContext.metadata?.chainId
    ) {
      const userAddress = intentContext.metadata.userAddress as `0x${string}`;
      const chainId = intentContext.metadata.chainId as number;

      try {
        await service.invalidateUserBalanceCache(userAddress, chainId);

        runtime.logger.info("Invalidated user balances cache after swap", {
          intentId: intentContext.id,
          userAddress,
          chainId,
        });
      } catch (error) {
        runtime.logger.error(
          "Error invalidating balance cache after swap:",
          error
        );
        // Don't fail the intent completion if cache invalidation fails
      }
    }

    // Intent should be completed after successful swap
    return true;
  } catch (error) {
    runtime.logger.error("Error in swap success handler:", error);
    // Still complete the intent even if cache invalidation fails
    return true;
  }
};
