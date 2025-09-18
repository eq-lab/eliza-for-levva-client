import { parseUnits } from "viem";
import {
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type Content,
} from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../../providers";
import {
  SWAP_PARAMS_PROVIDER_NAME,
  SwapParamsProviderData,
} from "../../providers/swap-params";
import { LevvaService } from "../../services/levva/class";
import { CalldataWithDescription } from "../../types/tx";
import { getChain } from "../../util";
import { rephrase } from "../../util/generate";
import { formatEstimation, selectSwapRouter } from "../../util/eth/swap";
import { unwrapEth, wrapEth } from "../../util/eth/weth";
import { IntentContext, IntentHandler } from "../../services/intent-manager";
import { ActionResult } from "../../util/action-results";

/**
 * Swap Intent Handler
 *
 * Handles token swapping operations with intent context tracking.
 * Supports Kyber swaps, ETH wrapping/unwrapping with multi-step workflows.
 */
export const handleSwapIntent: IntentHandler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> => {
  try {
    runtime.logger.info("Handling SWAP intent", {
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
    let lvva: LevvaProviderState | undefined;
    let params: SwapParamsProviderData | undefined;

    // Try to get data from composedState structure first (new pattern)
    if (state.data?.providers) {
      lvva = state.data.providers[LEVVA_PROVIDER_NAME]?.data;
      params = state.data.providers[SWAP_PARAMS_PROVIDER_NAME]?.data;
    }

    if (!lvva?.user) {
      throw new Error("User address ID is required");
    }

    if (!params) {
      throw new Error(
        `Failed to get provider(${SWAP_PARAMS_PROVIDER_NAME}) results`
      );
    }

    // Check if we have all required parameters
    if (!params.type || !params.tokenIn || !params.tokenOut || !params.amount) {
      // Missing parameters - ask user for more information
      return await handleMissingSwapParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        prevActions
      );
    }

    // All parameters available - execute the swap
    return await executeSwapTransaction(
      runtime,
      message,
      state,
      callback,
      intentContext,
      params,
      lvva,
      service,
      prevActions
    );
  } catch (error) {
    runtime.logger.error("Error in SWAP intent handler:", error);
    return await handleSwapError(
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
 * Handle case where swap parameters are missing
 */
async function handleMissingSwapParameters(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> {
  runtime.logger.info("Missing swap parameters, asking user for input", {
    intentId: intentContext.id,
  });

  if (!state.values.swap) {
    throw new Error("Failed to get swap parameters");
  }

  const content: Content = {
    thought:
      "Need to ask user for missing swap parameters to continue the intent",
    text: state.values.swap,
    actions: ["SWAP_TOKENS"],
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
      actionName: LEVVA_ACTIONS.SWAP_TOKENS,
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
 * Execute the swap transaction with all parameters available
 */
async function executeSwapTransaction(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  params: SwapParamsProviderData,
  lvva: LevvaProviderState,
  service: LevvaService,
  prevActions?: any
): Promise<ActionResult> {
  const { tokenIn, tokenOut, amount, type } = params;

  runtime.logger.info("Executing swap transaction", {
    intentId: intentContext.id,
    type,
    amount,
    tokenIn: tokenIn?.symbol,
    tokenOut: tokenOut?.symbol,
  });

  const amountUnits = parseUnits(amount!, tokenIn!.decimals);
  const chain = getChain(lvva.chainId);
  let calldata: CalldataWithDescription[];
  let thought: string;
  let text: string;

  switch (type) {
    case "kyber": {
      const swap = selectSwapRouter(tokenIn!, tokenOut!);

      const { calls, estimation } = await swap(runtime, {
        address: lvva.user!.address,
        amountIn: amountUnits,
        chain,
        decimals: tokenIn!.decimals,
      });

      calldata = calls;
      const description =
        calls.length > 1
          ? `### Transaction steps\n${calls.map((c, i) => `${i + 1}. ${c.description}`).join("\n")}`
          : `${calls[0].description}\n\n${formatEstimation(estimation)}`;
      thought = `Prepared Kyber swap transaction for intent ${intentContext.id} to swap ${amount} ${tokenIn!.symbol} to ${tokenOut!.symbol}`;
      text = `${description}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    case "wrap": {
      calldata = [
        wrapEth(amountUnits, {
          address: tokenOut!.address!,
          decimals: tokenOut!.decimals,
        }),
      ];

      thought = `Prepared ETH wrap transaction for intent ${intentContext.id} to wrap ${amount} ${tokenIn!.symbol} to ${tokenOut!.symbol}`;
      text = `Wrapping ${amount} ${tokenIn!.symbol} to ${tokenOut!.symbol}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    case "unwrap": {
      calldata = [
        unwrapEth(amountUnits, {
          address: tokenIn!.address!,
          decimals: tokenIn!.decimals,
        }),
      ];

      thought = `Prepared ETH unwrap transaction for intent ${intentContext.id} to unwrap ${amount} ${tokenIn!.symbol} to ${tokenOut!.symbol}`;
      text = `Unwrapping ${amount} ${tokenIn!.symbol} to ${tokenOut!.symbol}\n\nPlease approve transactions in your wallet.`;
      break;
    }
    default:
      throw new Error(`Unknown swap type: ${type}`);
  }

  const hash = await service.createCalldata(calldata);

  const json = {
    id: "calls.json",
    url: `/api/levva/calldata?hash=${hash}`,
  };

  const content: Content = {
    thought,
    text,
    actions: ["SWAP_TOKENS"],
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
      actionName: LEVVA_ACTIONS.SWAP_TOKENS,
      intentId: intentContext.id,
      intentType: intentContext.type,
      response: responseContent,
      thought: responseContent?.thought,
      initialReply: content.text,
      initialThought: content.thought,
      messageGenerated: true,
      transactionPrepared: true,
      calldataHash: hash,
      swapDetails: {
        type,
        amount,
        tokenIn: tokenIn!.symbol,
        tokenOut: tokenOut!.symbol,
        amountUnits: amountUnits.toString(),
      },
    },
    success: true,
  };
}

/**
 * Handle swap errors with intent context
 */
async function handleSwapError(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  error: Error,
  prevActions?: any
): Promise<ActionResult> {
  runtime.logger.error("Swap intent error", {
    intentId: intentContext.id,
    error: error.message,
  });

  const errorMessage = error.message ?? "unknown error";
  const thought = `Swap intent ${intentContext.id} failed with error: ${errorMessage}. I should tell the user about the error.`;
  const text = `Failed to prepare swap transaction, reason: ${errorMessage}. Please try again.`;

  const responseContent = await rephrase({
    runtime,
    content: {
      text,
      thought,
      actions: ["SWAP_TOKENS"],
      source: message.content.source,
    },
    state: state!,
    prevActions,
  });

  await callback?.(responseContent);

  return {
    text: `Error generating swap transaction: ${errorMessage}.`,
    values: {
      success: false,
      responded: true,
      error: true,
      lastReply: responseContent.text,
      lastReplyTime: Date.now(),
      thoughtProcess: responseContent?.thought,
    },
    data: {
      actionName: LEVVA_ACTIONS.SWAP_TOKENS,
      intentId: intentContext.id,
      intentType: intentContext.type,
      error: errorMessage,
    },
    success: false,
    error: error,
  };
}

/**
 * Swap completion handler for evaluators
 * Called when a swap transaction is confirmed
 */
export const onSwapSuccess = async (
  runtime: IAgentRuntime,
  intentContext: IntentContext,
  transactionReceipt: any
): Promise<boolean> => {
  try {
    runtime.logger.info("Swap transaction completed successfully", {
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
