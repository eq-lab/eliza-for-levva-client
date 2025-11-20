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
}): Promise<string> {
  const { runtime, intentContext, conversation, userAddress, chainId } = params;
  const levvaService = runtime.getService<LevvaService>(
    LEVVA_SERVICE.LEVVA_COMMON
  );

  if (!levvaService) {
    throw new Error("LevvaService not found");
  }

  const tokenPrices = await levvaService.token.getTokensPrices(chainId);
  const tokenPricesMap = new Map(
    tokenPrices.map((token) => [token.symbol.toLowerCase(), token.priceUsd])
  );

  const walletAssets = (
    await levvaService.wallet.getWalletAssets({
      address: userAddress,
      chainId,
    })
  )
    .filter((asset) => asset.amount > 0n)
    .map((asset) => {
      const token = levvaService.token.getTokenFromMap({
        chainId,
        address: asset.token,
      });
      const price =
        asset.token === ETH_NULL_ADDR
          ? tokenPricesMap.get("weth")
          : tokenPricesMap.get(token?.symbol?.toLowerCase() ?? "");
      const balance = formatUnits(asset.amount, token?.decimals ?? 18);
      const balanceUsd = price ? (price * Number(balance)).toFixed(2) : "0.00";

      return {
        symbol:
          token?.symbol ||
          (asset.token === ETH_NULL_ADDR ? "ETH" : asset.token.slice(0, 8)),
        address: asset.token,
        balance: asset.amount,
        decimals: token?.decimals ?? 18,
        balanceUsd,
      };
    });

  const allPendleMarkets = await levvaService.getPendleMarkets(chainId);

  const pendleFilteredMarkets = await levvaService.filterPendleMarkets(
    allPendleMarkets,
    intentContext.returnData?.tokenOut ?? undefined,
    intentContext.returnData?.maturityDays ?? undefined,
    intentContext.returnData?.tokenClass ?? undefined
  );

  // Generate prompt using consolidated prompt function
  return generatePendleStrategyIntentSuggestionsPrompt({
    intentContext,
    conversation,
    userAddress,
    chainId,
    returnData: intentContext.returnData || {},
    walletAssets,
    pendleFilteredMarkets,
    allPendleMarkets,
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
      !params.type ||
      !params.tokenInData ||
      !params.tokenOutData ||
      !params.amountIn ||
      !params.pendleMarketAddress
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
    tokenInData,
    tokenOutData,
    pendleMarketAddress,
    amountIn,
    type,
    slippage,
  } = params;

  runtime.logger.info("Executing Pendle strategy transaction", {
    intentId: intentContext.id,
    type,
    amountIn,
    tokenInSymbol: tokenInData?.symbol,
    pendleMarketAddress: pendleMarketAddress,
  });

  const amountUnits = parseUnits(amountIn!, tokenInData!.decimals);
  let calldata: CalldataWithDescription[] = [];
  let thought: string;
  let text: string;

  switch (type) {
    case "buy": {
      const convert = await getPendleConvert({
        receiver: levvaProviderState.user!.address as `0x${string}`,
        chainId: `${levvaProviderState.chainId}`,
        tokensIn: tokenInData!.address! as `0x${string}`,
        tokensOut: tokenOutData!.address! as `0x${string}`,
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
            title: `Approve ${formatUnits(BigInt(approval.amount), tokenInData!.decimals!)} ${tokenInData!.symbol!}`,
            description: `Approve spending ${formatUnits(BigInt(approval.amount), tokenInData!.decimals!)} ${tokenInData!.symbol!} to ${tokenOutData!.symbol!}`,
          });
        }
      }

      calldata.push({
        to: route.to as `0x${string}`,
        data: route.data as `0x${string}`,
        value: route.value,
        title: `Swap ${amountIn} ${tokenInData!.symbol} to ${tokenOutData!.symbol!}`,
        description: `Swap ${amountIn!} ${tokenInData!.symbol} to ${tokenOutData!.symbol!}`,
      });

      const description =
        calldata.length > 1
          ? `### Transaction steps\n${calldata.map((c, i) => `${i + 1}. ${c.description}`).join("\n")}`
          : calldata[0].description;
      thought = `Prepared Pendle strategy transaction for intent ${intentContext.id}: ${type} ${tokenOutData!.symbol!} for ${amountIn} ${tokenInData!.symbol!}`;
      text = `${description}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    // TODO: implement cases below
    case "sell":
    case "deposit":
    case "withdraw":
    default:
      throw new Error(`Unknown Pendle strategy type: ${type}`);
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
        type,
        amountIn,
        tokenIn: tokenInData,
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
