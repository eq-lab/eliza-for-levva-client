import { parseUnits, formatUnits } from "viem";
import { ModelType, Provider } from "@elizaos/core";
import { LEVVA_SERVICE, LEVVA_ACTIONS } from "../constants/enum";
import { INTENT_CONFIDENCE_THRESHOLD } from "../constants/intent";
import { ETH_NULL_ADDR } from "../constants/eth";
import { LevvaService } from "../services/levva/class";
import { selectSwapDataFromMessagesPrompt } from "../prompts/swap";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "./index";
import { EMPTY_RESULT, selectProviderState, checkSimpleReply } from "./util";
import { TokenDataWithInfo } from "../types/token";
import { IntentManager, IntentContext } from "../services/intent-manager";

export type SwapType = "kyber" | "wrap" | "unwrap";

export interface SwapParamsProviderData {
  fromToken?: string;
  toToken?: string;
  tokenIn?: TokenDataWithInfo;
  tokenOut?: TokenDataWithInfo;
  amount?: string;
  type?: SwapType;
  intentContext?: IntentContext;
}

export const SWAP_PARAMS_PROVIDER_NAME = "SWAP_PARAMS";

interface ExtractedSwapParams {
  fromToken: string;
  toToken: string;
  amount: string;
}

export const swapParamsProvider: Provider = {
  name: SWAP_PARAMS_PROVIDER_NAME,
  description:
    "Parameters for swap transaction. Enable this provider if user wants to swap tokens.",
  dynamic: true,
  async get(runtime, message, state) {
    // Check for simple reply mode first
    const simpleReply = checkSimpleReply(
      runtime,
      state,
      "SWAP-PARAMS",
      "Swap analysis data"
    );
    if (simpleReply) return simpleReply;

    const service = await runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      return {
        ...EMPTY_RESULT,
        text: `Service "${LEVVA_SERVICE.LEVVA_COMMON}" not found. Unable to get swap params.`,
      };
    }

    const lvva = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      state
    );

    if (!lvva?.user) {
      return {
        ...EMPTY_RESULT,
        text: `User address not found. Unable to get swap params.`,
      };
    }
    const { user, chainId, tokens } = lvva;

    // Extract user info for intent management
    const raw: any = (message.metadata as unknown as { raw: any }).raw;
    const userId = raw.senderId;
    const channelId = raw.channelId;

    // Handle intent management
    const intentService = runtime.getService<IntentManager>(
      LEVVA_SERVICE.INTENT_MANAGER
    );

    let intentContext: IntentContext | undefined;

    if (!intentService) {
      throw new Error("Failed to get intent service");
    }

    try {
      // Handle intent management
      {
        // Check for existing active intent
        intentContext = await intentService.getActiveIntentByDomain(
          userId,
          channelId,
          LEVVA_ACTIONS.SWAP_TOKENS
        );

        // Use helper function to handle intent detection and creation with global threshold
        intentContext = await intentService.handleIntentDetectionAndCreation(
          message,
          LEVVA_ACTIONS.SWAP_TOKENS,
          userId,
          channelId,
          intentContext,
          INTENT_CONFIDENCE_THRESHOLD
        );

        // Add swap-specific metadata if intent was created
        if (
          intentContext &&
          intentContext.metadata &&
          !intentContext.metadata.userAddress
        ) {
          intentContext.metadata.userAddress = user.address;
          intentContext.metadata.chainId = chainId;
          await intentService.storeIntent(intentContext);
        }

        // Add current message to intent memory
        if (intentContext) {
          await intentService.addMemoryToIntent(intentContext, message);
        }
      }
    } catch (error) {
      runtime.logger.warn("Error in swap intent management:", error);
      // Continue without intent context if there's an error
    }

    // Use intent context if available for better parameter extraction
    const promptContext = intentContext
      ? {
          recentMessages: state.values.recentMessages,
          tokens: tokens?.map(service.formatToken).join("\n") ?? "",
          intentContext: {
            type: intentContext.type,
            returnData: intentContext.returnData,
            memories:
              intentContext.memories?.map((m) => m.content.text).join("\n") ??
              "",
          },
        }
      : {
          recentMessages: state.values.recentMessages,
          tokens: tokens?.map(service.formatToken).join("\n") ?? "",
        };

    // according to logs provider can be called multiple times for the same message, so cache llm call
    const cacheKey = `swap-params-${message.id}`;
    let params = await runtime.getCache<ExtractedSwapParams>(cacheKey);

    if (!params) {
      params = await runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt: selectSwapDataFromMessagesPrompt(promptContext),
      });

      if (intentContext && params) {
        await intentService.updateIntent(intentContext, params);
      }

      await runtime.setCache(cacheKey, params);
    }

    if (typeof params !== "object") {
      return {
        ...EMPTY_RESULT,
        // suppress if no action state
        text: `Failed to extract swap parameters.`,
      };
    }

    const { fromToken, toToken, amount } = params;
    const data: SwapParamsProviderData = {};

    if (!fromToken) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: "Unknown 'from' token, ask user for it.",
        },
        text: "Failed to extract swap parameters: unknown token from",
      };
    }

    data.fromToken = fromToken;

    if (!toToken) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: "Unknown 'to' token, ask user for it.",
        },
        text: "Failed to extract swap parameters: unknown token to",
      };
    }

    data.toToken = toToken;

    if (!amount) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: "Unknown amount to swap",
        },
        text: "Failed to extract swap parameters: unknown amount",
      };
    }

    data.amount = amount;
    const tokenIn = await service.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: fromToken,
    });

    if (!tokenIn) {
      const unknownFromTokenText = `## ❓ Unknown Token

**Token**: ${fromToken}
**Issue**: Token not found in our database

Please provide a valid token symbol (like USDC, ETH, WETH) or token address (0x...) for the token you want to swap from.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: unknownFromTokenText,
          fromToken: fromToken,
          error: "unknown_from_token",
        },
        text: unknownFromTokenText,
      };
    }

    data.tokenIn = tokenIn;

    const tokenOut = await service.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: toToken,
    });

    if (!tokenOut) {
      const unknownToTokenText = `## ❓ Unknown Token

**Token**: ${toToken}
**Issue**: Token not found in our database

Please provide a valid token symbol (like USDC, ETH, WETH) or token address (0x...) for the token you want to swap to.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: unknownToTokenText,
          toToken: toToken,
          error: "unknown_to_token",
        },
        text: unknownToTokenText,
      };
    }

    data.tokenOut = tokenOut;

    const balance = await service.getBalanceOf(
      user.address,
      chainId,
      tokenIn.address ?? ETH_NULL_ADDR
    );

    const amountUnits = parseUnits(String(data.amount ?? 0), tokenIn.decimals);

    if ((balance?.amount ?? 0n) < amountUnits) {
      const currentBalance = formatUnits(
        balance?.amount ?? 0n,
        tokenIn.decimals
      );
      const insufficientBalanceText = `## ❌ Insufficient Balance

**Token**: ${tokenIn.symbol} (${tokenIn.name})
**Requested Amount**: ${data.amount} ${tokenIn.symbol}
**Current Balance**: ${currentBalance} ${tokenIn.symbol}
**Shortfall**: ${(parseFloat(data.amount!) - parseFloat(currentBalance)).toFixed(6)} ${tokenIn.symbol}

You need more ${tokenIn.symbol} to complete this swap.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: insufficientBalanceText,
          fromToken: `${tokenIn.symbol} (${tokenIn.name})`,
          amount: `${data.amount} ${tokenIn.symbol}`,
          userBalance: `${currentBalance} ${tokenIn.symbol}`,
          error: "insufficient_balance",
        },
        text: insufficientBalanceText,
      };
    }

    const weth = await service.getWETH(chainId);

    // Format token information for display
    const formatTokenInfo = (token: TokenDataWithInfo) => {
      const isNative = !token.address || token.address === ETH_NULL_ADDR;
      return `${token.symbol} (${token.name})${isNative ? " - Native token" : ` - ${token.address}`}`;
    };

    // Get user's current balance for the input token
    const userBalance = formatUnits(balance?.amount ?? 0n, tokenIn.decimals);
    const balanceInfo = `Current balance: ${userBalance} ${tokenIn.symbol}`;

    let text: string;
    let swapDetails: string;

    if (weth.address === tokenIn.address && !tokenOut.address) {
      data.type = "unwrap";
      swapDetails = `## Unwrap Transaction 🔄

**From**: ${formatTokenInfo(tokenIn)}
**To**: Native ETH
**Amount**: ${data.amount} ${tokenIn.symbol}
**${balanceInfo}**

User wants to unwrap ${data.amount} ${fromToken} to native ETH.`;
      text = swapDetails;
    } else if (weth.address === tokenOut.address && !tokenIn.address) {
      data.type = "wrap";
      swapDetails = `## Wrap Transaction 🔄

**From**: Native ETH
**To**: ${formatTokenInfo(tokenOut)}
**Amount**: ${data.amount} ETH
**${balanceInfo}**

User wants to wrap ${data.amount} native ETH to ${toToken}.`;
      text = swapDetails;
    } else {
      data.type = "kyber";
      swapDetails = `## Token Swap 🔄

**From**: ${formatTokenInfo(tokenIn)}
**To**: ${formatTokenInfo(tokenOut)}
**Amount**: ${data.amount} ${tokenIn.symbol}
**${balanceInfo}**
**Platform**: KyberSwap

User wants to swap ${data.amount} ${fromToken} to ${toToken} on KyberSwap.`;
      text = swapDetails;
    }

    // Update intent context with extracted parameters if available
    if (intentContext && intentService) {
      try {
        intentContext.returnData = {
          ...intentContext.returnData,
          fromToken,
          toToken,
          amount,
          tokenIn: tokenIn.symbol,
          tokenOut: tokenOut.symbol,
          swapType: data.type,
        };
        await intentService.storeIntent(intentContext);
      } catch (error) {
        runtime.logger.warn(
          "Error updating intent context with swap parameters:",
          error
        );
      }
    }

    return {
      ...EMPTY_RESULT,
      data: { ...data, intentContext },
      values: {
        swap: text,
        fromToken: `${tokenIn.symbol} (${tokenIn.name})`,
        toToken: `${tokenOut.symbol} (${tokenOut.name})`,
        amount: `${data.amount} ${tokenIn.symbol}`,
        userBalance: `${userBalance} ${tokenIn.symbol}`,
        swapType: data.type,
        platform:
          data.type === "kyber"
            ? "KyberSwap"
            : data.type === "wrap"
              ? "Wrap"
              : "Unwrap",
      },
      text,
    };
  },
};
