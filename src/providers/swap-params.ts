import { parseUnits } from "viem";
import { ModelType, Provider } from "@elizaos/core";
import { LEVVA_SERVICE, LEVVA_ACTIONS } from "../constants/enum";
import { ETH_NULL_ADDR } from "../constants/eth";
import { LevvaService } from "../services/levva/class";
import { selectSwapDataFromMessagesPrompt } from "../prompts/swap";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "./index";
import { EMPTY_RESULT, selectProviderState } from "./util";
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

    if (intentService) {
      try {
        // Check for existing active intent
        intentContext = await intentService.getActiveIntentByDomain(
          userId,
          channelId,
          LEVVA_ACTIONS.SWAP_TOKENS
        );

        // Use helper function to handle intent detection and creation
        intentContext = await intentService.handleIntentDetectionAndCreation(
          message,
          LEVVA_ACTIONS.SWAP_TOKENS,
          userId,
          channelId,
          intentContext
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
      } catch (error) {
        runtime.logger.warn("Error in swap intent management:", error);
        // Continue without intent context if there's an error
      }
    }

    // according to logs provider can be called multiple times for the same message, so cache llm call
    const cacheKey = `swap-params-${message.id}`;
    let params = await runtime.getCache<ExtractedSwapParams>(cacheKey);

    if (!params) {
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

      params = await runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt: selectSwapDataFromMessagesPrompt(promptContext),
      });

      await runtime.setCache(cacheKey, params);
    }

    if (typeof params !== "object") {
      return {
        ...EMPTY_RESULT,
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
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: `Unknown 'from' token ${fromToken}, ask user for token address.`,
        },
        text: `Failed to prepare swap: unknown token ${fromToken}. Ask user for token address.`,
      };
    }

    data.tokenIn = tokenIn;

    const tokenOut = await service.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: toToken,
    });

    if (!tokenOut) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: `Unknown 'to' token ${toToken}, ask user for token address.`,
        },
        text: `Failed to prepare swap: unknown token ${toToken}. Ask user for token address.`,
      };
    }

    data.tokenOut = tokenOut;

    const balance = await service.getBalanceOf(
      user.address,
      chainId,
      tokenIn.address ?? ETH_NULL_ADDR
    );

    const amountUnits = parseUnits(data.amount!, tokenIn.decimals);

    if ((balance?.amount ?? 0n) < amountUnits) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: `Insufficient balance for ${fromToken}`,
        },
        text: `Insufficient balance for ${fromToken}. Ask user to deposit more ${fromToken} to ${user.address}.`,
      };
    }

    const weth = await service.getWETH(chainId);
    let text: string;

    if (weth.address === tokenIn.address && !tokenOut.address) {
      data.type = "unwrap";
      text = `User wants to unwrap ${data.amount} ${fromToken} to native ETH.`;
    } else if (weth.address === tokenOut.address && !tokenIn.address) {
      data.type = "wrap";
      text = `User wants to wrap ${data.amount} native ETH to ${fromToken}.`;
    } else {
      data.type = "kyber";
      text = `User wants to swap ${data.amount} ${fromToken} to ${toToken} on KyberSwap.`;
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
      },
      text,
    };
  },
};
