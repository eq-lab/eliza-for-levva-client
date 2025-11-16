import { formatUnits } from "viem";
import { ModelType, Provider } from "@elizaos/core";
import { LEVVA_SERVICE, LEVVA_ACTIONS } from "../constants/enum";
import { INTENT_CONFIDENCE_THRESHOLD } from "../constants/intent";
import { ETH_NULL_ADDR } from "../constants/eth";
import { LevvaService } from "../services/levva/class";
import {
  selectPendleDataFromMessagesPrompt,
  extractedPendleParamsSchema,
  ExtractedPendleParams,
} from "../prompts/pendle";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "./index";
import { EMPTY_RESULT, selectProviderState, checkSimpleReply } from "./util";
import { IntentManager, IntentContext } from "../services/intent-manager";
import { zodJsonSchema } from "../prompts/util";
import { PendleMarket } from "../api/levva/schema";

export interface PendleParamsProviderData {
  tokenInAddress?: string;
  tokenOutAddress?: string;
  amountInNative?: string;
  receiver?: string;
  slippage?: number;
  type?: "buy" | "sell" | "deposit" | "withdraw";
}

export const PENDLE_PARAMS_PROVIDER_NAME = "PENDLE_PARAMS";

// TODO: this provider must support buy/sell PT and deposit/withdraw into Pendle pools
// TODO: ETH address is "address(0)" in Pendle
// TODO: update "regular swap" with "kyber swap" provider

// TODO: the flow
// user selects asset class: "Stable", "ETH", "BTC"
// then user selects the maturity preferences: up to 30 days, 30 to 90 days, more than 90 days
// then AI agent suggests top 5 markets: name, maturity, liquidity, underlying 0
// then user selects the market
// then AI agent suggests 2 strategies: "buy PT", "deposit liquidity"
//
export const pendleParamsProvider: Provider = {
  name: PENDLE_PARAMS_PROVIDER_NAME,
  description:
    "Parameters for Pendle PT token operations. " +
    "Enable this provider if user wants to buy/sell Pendle PT tokens or deposit/withdraw liquidity in Pendle pools.",
  dynamic: true,
  async get(runtime, message, state) {
    // Check for simple reply mode first
    const simpleReply = checkSimpleReply(
      runtime,
      state,
      PENDLE_PARAMS_PROVIDER_NAME,
      "Pendle analysis data"
    );
    if (simpleReply) return simpleReply;

    const levvaService = await runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!levvaService) {
      return {
        ...EMPTY_RESULT,
        text: `Service "${LEVVA_SERVICE.LEVVA_COMMON}" not found. Unable to get swap params.`,
      };
    }

    const levvaProviderState = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      state
    );

    if (!levvaProviderState?.user) {
      return {
        ...EMPTY_RESULT,
        text: `User address not found. Unable to get Pendle params.`,
      };
    }
    const { user, chainId, tokens } = levvaProviderState;

    // Extract user info for intent management
    const raw: any = (message.metadata as unknown as { raw: any }).raw;
    const userId = raw.senderId;
    const channelId = raw.channelId;

    // Handle intent management
    const intentManager = runtime.getService<IntentManager>(
      LEVVA_SERVICE.INTENT_MANAGER
    );

    let intentContext: IntentContext | undefined;

    if (!intentManager) {
      throw new Error("Failed to get the intent manager");
    }

    // Handle intent management
    try {
      // Check for existing active intent
      intentContext = await intentManager.getActiveIntentByDomain(
        userId,
        channelId,
        LEVVA_ACTIONS.SWAP_TOKENS
      );

      // Use helper function to handle intent detection and creation with global threshold
      intentContext = await intentManager.handleIntentDetectionAndCreation(
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
        await intentManager.storeIntent(intentContext);
      }

      // Add current message to intent memory
      if (intentContext) {
        await intentManager.addMemoryToIntent(intentContext, message);
      }
    } catch (error) {
      runtime.logger.warn("Error in swap intent management:", error);
      // Continue without intent context if there's an error
    }

    // Fetch user's wallet portfolio (all tokens with non-zero balances)
    // This helps LLM suggest which tokens to swap from and calculate amounts
    let pendleMarkets: PendleMarket[] | undefined;
    let userPortfolio: string | undefined;
    let pendleTokens: string | undefined;

    try {
      const walletAssets = await levvaService.getWalletAssets({
        chainId,
        address: user.address,
      });

      pendleMarkets = await levvaService.getPendleMarkets(chainId);

      // Filter non-zero balances and format with token info
      const portfolioEntries = walletAssets
        .filter((asset) => asset.amount > 0n)
        .map((asset) => {
          const token = tokens?.find(
            (t) =>
              t.address?.toLowerCase() === asset.token.toLowerCase() ||
              (asset.token === ETH_NULL_ADDR && t.symbol === "ETH")
          );
          const symbol =
            token?.symbol ||
            (asset.token === ETH_NULL_ADDR ? "ETH" : "Unknown");
          const decimals = token?.decimals ?? 18;
          const balance = formatUnits(asset.amount, decimals);
          return `${symbol}: ${balance} (${decimals} decimals)`;
        })
        .join("\n");

      const pendleAssets = [
        ...new Set(
          pendleMarkets?.map((market) => market.underlyingAssetName) ?? []
        ),
      ].join("\n");

      if (portfolioEntries) {
        userPortfolio = portfolioEntries;
      }

      if (pendleAssets.length > 0) {
        pendleTokens = pendleAssets;
      }
    } catch (error) {
      runtime.logger.warn(
        "[SWAP-PARAMS] Failed to fetch wallet portfolio:",
        error
      );
    }

    // Use intent context if available for better parameter extraction
    const promptContext = intentContext
      ? {
          recentMessages: state.values.recentMessages,
          userPortfolio,
          pendleTokens,
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
          userPortfolio,
          pendleTokens,
        };

    // according to logs provider can be called multiple times for the same message, so cache llm call
    const cacheKey = `pendle-params-${message.id}`;
    let params = await runtime.getCache<ExtractedPendleParams>(cacheKey);

    if (!params) {
      params = await runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt: selectPendleDataFromMessagesPrompt(promptContext),
        schema: zodJsonSchema(extractedPendleParamsSchema),
        temperature: 0,
      });

      if (intentContext && params) {
        await intentManager.updateIntent(intentContext, params);
      }

      await runtime.setCache(cacheKey, params);
    }

    if (typeof params !== "object") {
      return {
        ...EMPTY_RESULT,
        // suppress if no action state
        text: `Failed to extract Pendle parameters.`,
      };
    }

    const { token, tokenClass, maturityDays, amount, type } = params;
    const data: PendleParamsProviderData = {};

    if (!token) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: "Unknown 'from' token, ask user for it.",
        },
        text: "Failed to extract swap parameters: unknown token from",
      };
    }

    if (!type) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: "Unknown 'type', ask user for it.",
        },
        text: "Failed to extract Pendle parameters: unknown type",
      };
    }

    const utcNowDateInMsec =
      Math.floor(Date.now()) - Math.floor(Date.now() % 86400000);

    pendleMarkets?.filter((market) => {
      const maturityDate = new Date(market.maturityDate);
      const daysUntilMaturity = Math.ceil(
        (maturityDate.getTime() - utcNowDateInMsec) / 86400000
      );
      return (
        (!token || tokenClass === market.underlyingAssetName) &&
        (!maturityDays || maturityDays! <= daysUntilMaturity) &&
        (!tokenClass || tokenClass === market.underlyingType)
      );
    });

    data.type = type;
    data.tokenInAddress = token;
    data.slippage = 0.005;
    data.receiver = user.address;

    if (!amount) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          swap: "Unknown amount",
        },
        text: "Failed to extract Pendle parameters: unknown amount",
      };
    }
    // TODO: convert amount to native token amount
    data.amountInNative = amount;

    //     if (!tokenIn) {
    //       const unknownFromTokenText = `## ❓ Unknown Token

    // **Token**: ${fromToken}
    // **Issue**: Token not found in our database

    // Please provide a valid token symbol (like USDC, ETH, WETH) or token address (0x...) for the token you want to swap from.`;

    //       return {
    //         ...EMPTY_RESULT,
    //         data: { ...data, intentContext },
    //         values: {
    //           swap: unknownFromTokenText,
    //           fromToken: fromToken,
    //           error: "unknown_from_token",
    //         },
    //         text: unknownFromTokenText,
    //       };
    //     }

    //     data.tokenIn = tokenIn;

    //     const tokenOut = await levvaService.getTokenDataWithInfo({
    //       chainId,
    //       symbolOrAddress: toToken,
    //     });

    //     if (!tokenOut) {
    //       const unknownToTokenText = `## ❓ Unknown Token

    // **Token**: ${toToken}
    // **Issue**: Token not found in our database

    // Please provide a valid token symbol (like USDC, ETH, WETH) or token address (0x...) for the token you want to swap to.`;

    //       return {
    //         ...EMPTY_RESULT,
    //         data: { ...data, intentContext },
    //         values: {
    //           swap: unknownToTokenText,
    //           toToken: toToken,
    //           error: "unknown_to_token",
    //         },
    //         text: unknownToTokenText,
    //       };
    //     }

    //     data.tokenOut = tokenOut;

    //     const balance = await levvaService.getBalanceOf(
    //       user.address,
    //       chainId,
    //       tokenIn.address ?? ETH_NULL_ADDR
    //     );

    //     const amountUnits = parseUnits(String(data.amount ?? 0), tokenIn.decimals);

    //     if ((balance?.amount ?? 0n) < amountUnits) {
    //       const currentBalance = formatUnits(
    //         balance?.amount ?? 0n,
    //         tokenIn.decimals
    //       );
    //       // Use actual token decimals for shortfall display
    //       const tokenDecimals = tokenIn.decimals ?? 18;
    //       const insufficientBalanceText = `## ❌ Insufficient Balance

    // **Token**: ${tokenIn.symbol} (${tokenIn.name})
    // **Requested Amount**: ${data.amount} ${tokenIn.symbol}
    // **Current Balance**: ${currentBalance} ${tokenIn.symbol}
    // **Shortfall**: ${(parseFloat(data.amount!) - parseFloat(currentBalance)).toFixed(tokenDecimals)} ${tokenIn.symbol}

    // You need more ${tokenIn.symbol} to complete this swap.`;

    //       return {
    //         ...EMPTY_RESULT,
    //         data: { ...data, intentContext },
    //         values: {
    //           swap: insufficientBalanceText,
    //           fromToken: `${tokenIn.symbol} (${tokenIn.name})`,
    //           amount: `${data.amount} ${tokenIn.symbol}`,
    //           userBalance: `${currentBalance} ${tokenIn.symbol}`,
    //           error: "insufficient_balance",
    //         },
    //         text: insufficientBalanceText,
    //       };
    //     }

    //     const weth = await levvaService.getWETH(chainId);

    //     // Format token information for display
    //     const formatTokenInfo = (token: TokenDataWithInfo) => {
    //       const isNative = !token.address || token.address === ETH_NULL_ADDR;
    //       return `${token.symbol} (${token.name})${isNative ? " - Native token" : ` - ${token.address}`}`;
    //     };

    //     // Get user's current balance for the input token
    //     const userBalance = formatUnits(balance?.amount ?? 0n, tokenIn.decimals);
    //     const balanceInfo = `Current balance: ${userBalance} ${tokenIn.symbol}`;

    //     let text: string;
    //     let swapDetails: string;

    //     if (weth.address === tokenIn.address && !tokenOut.address) {
    //       data.type = "unwrap";
    //       swapDetails = `## Unwrap Transaction 🔄

    // **From**: ${formatTokenInfo(tokenIn)}
    // **To**: Native ETH
    // **Amount**: ${data.amount} ${tokenIn.symbol}
    // **${balanceInfo}**

    // User wants to unwrap ${data.amount} ${fromToken} to native ETH.`;
    //       text = swapDetails;
    //     } else if (weth.address === tokenOut.address && !tokenIn.address) {
    //       data.type = "wrap";
    //       swapDetails = `## Wrap Transaction 🔄

    // **From**: Native ETH
    // **To**: ${formatTokenInfo(tokenOut)}
    // **Amount**: ${data.amount} ETH
    // **${balanceInfo}**

    // User wants to wrap ${data.amount} native ETH to ${toToken}.`;
    //       text = swapDetails;
    //     } else {
    //       data.type = "kyber";
    //       swapDetails = `## Token Swap 🔄

    // **From**: ${formatTokenInfo(tokenIn)}
    // **To**: ${formatTokenInfo(tokenOut)}
    // **Amount**: ${data.amount} ${tokenIn.symbol}
    // **${balanceInfo}**
    // **Platform**: KyberSwap

    // User wants to swap ${data.amount} ${fromToken} to ${toToken} on KyberSwap.`;
    //       text = swapDetails;
    //     }

    //     // Update intent context with extracted parameters if available
    //     if (intentContext && intentManager) {
    //       try {
    //         intentContext.returnData = {
    //           ...intentContext.returnData,
    //           fromToken,
    //           toToken,
    //           amount,
    //           tokenIn: tokenIn.symbol,
    //           tokenOut: tokenOut.symbol,
    //           swapType: data.type,
    //         };
    //         await intentManager.storeIntent(intentContext);
    //       } catch (error) {
    //         runtime.logger.warn(
    //           "Error updating intent context with swap parameters:",
    //           error
    //         );
    //       }
    //     }

    return {
      ...EMPTY_RESULT,
      data: { ...data, intentContext },
      values: {
        // swap: text,
        // fromToken: `${tokenIn.symbol} (${tokenIn.name})`,
        // toToken: `${tokenOut.symbol} (${tokenOut.name})`,
        // amount: `${data.amount} ${tokenIn.symbol}`,
        // userBalance: `${userBalance} ${tokenIn.symbol}`,
        // swapType: data.type,
        // platform:
        //   data.type === "kyber"
        //     ? "KyberSwap"
        //     : data.type === "wrap"
        //       ? "Wrap"
        //       : "Unwrap",
        tokenInAddress: data.tokenInAddress,
        tokenOutAddress: undefined, // TODO: add token out address
        amountInNative: data.amountInNative,
        receiver: data.receiver,
        slippage: data.slippage,
        type: data.type,
      },
      // text, // TODO: add text
    };
  },
};
