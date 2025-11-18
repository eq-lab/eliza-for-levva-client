import { formatUnits, parseUnits } from "viem";
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
import { TokenDataWithInfo } from "../types/token";

export interface PendleParamsProviderData {
  tokenInData?: TokenDataWithInfo;
  pendleMarketAddress?: string;
  amountIn?: string;
  slippage?: string;
  type?: "buy" | "sell" | "deposit" | "withdraw";
  intentContext?: IntentContext;
}

export const PENDLE_PARAMS_PROVIDER_NAME = "PENDLE_PARAMS";

// TODO: this provider must support buy/sell PT and deposit/withdraw into Pendle pools
// TODO: ETH address is "address(0)" in Pendle
// TODO: update "regular swap" with "kyber swap" provider
// TODO: add support for slippage

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
        text: `Service "${LEVVA_SERVICE.LEVVA_COMMON}" not found. Unable to get Pendle params.`,
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
        LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY
      );

      // Use helper function to handle intent detection and creation with global threshold
      intentContext = await intentManager.handleIntentDetectionAndCreation(
        message,
        LEVVA_ACTIONS.SELECT_PENDLE_STRATEGY,
        userId,
        channelId,
        intentContext,
        INTENT_CONFIDENCE_THRESHOLD
      );

      // Add Pendle-specific metadata if intent was created
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
      runtime.logger.warn("Error in Pendle intent management:", error);
      // Continue without intent context if there's an error
    }

    // Fetch user's wallet portfolio (all tokens with non-zero balances)
    // This helps LLM suggest which tokens to swap from and calculate amounts
    let pendleMarkets: PendleMarket[] = [];
    let userPortfolio: string | undefined;
    let pendleTokens: string | undefined;

    try {
      const walletAssets = await levvaService.wallet.getWalletAssets({
        chainId,
        address: user.address,
      });
      const tokenPrices = await levvaService.token.getTokensPrices(chainId);

      pendleMarkets =
        (await levvaService.getPendleMarkets(chainId))?.sort((a, b) =>
          a.maturityDate.localeCompare(b.maturityDate)
        ) ?? [];

      // Filter non-zero balances and format with token info
      const portfolioEntries = walletAssets
        .filter((asset) => asset.amount > 0n)
        .map((asset) => {
          const token = tokens?.find(
            (t) =>
              t.address?.toLowerCase() === asset.token.toLowerCase() ||
              (asset.token === ETH_NULL_ADDR && t.symbol === "ETH")
          );
          const price = tokenPrices?.get(asset.token.toLowerCase());
          const symbol =
            token?.symbol ||
            (asset.token === ETH_NULL_ADDR ? "ETH" : "Unknown");
          const decimals = token?.decimals ?? 18;
          const balance = formatUnits(asset.amount, decimals);
          const balanceUSD = price
            ? (price * Number(balance)).toFixed(2)
            : "0.00";
          return `${symbol}: ${balance} (≈$${balanceUSD})`;
        })
        .join("\n");

      const pendleAssets = [
        pendleMarkets.map(
          (market) =>
            `PT ${market.underlyingAssetName} (${market.underlyingType}, ${market.maturityDate})`
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
        "[PENDLE-PARAMS] Failed to fetch wallet portfolio:",
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

    const { tokenIn, tokenOut, tokenClass, maturityDays, amountIn, type } =
      params;
    const data: PendleParamsProviderData = {};

    if (!tokenIn) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: "Unknown 'from' token, ask user for it.",
        },
        text: "Failed to extract Pendle parameters: unknown token in",
      };
    }

    let pendleMarket: PendleMarket | undefined;

    const utcNowDate = Date.now();
    const utcNowDateInMsec = Math.floor(
      utcNowDate - Math.floor(utcNowDate % 86400000)
    );

    pendleMarket = pendleMarkets.findLast((market) => {
      const maturityDate = new Date(market.maturityDate);
      const daysUntilMaturity = Math.ceil(
        (maturityDate.getTime() - utcNowDateInMsec) / 86400000
      );
      return (
        (!tokenOut ||
          tokenOut.toLocaleLowerCase() ===
            market.underlyingAssetName.toLocaleLowerCase()) &&
        (!maturityDays ||
          (maturityDays === "<=30" && daysUntilMaturity <= 30) ||
          (maturityDays === "30-90" && daysUntilMaturity <= 90) ||
          (maturityDays === ">90" && daysUntilMaturity > 90)) &&
        (!tokenClass || tokenClass === market.underlyingType)
      );
    });

    if (!pendleMarket) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: "Unknown 'to' token, ask user for it.",
        },
        text: "Failed to extract Pendle parameters: unknown token to",
      };
    }

    data.pendleMarketAddress = pendleMarket!.pendleMarketAddress;

    if (!type) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: "Unknown 'type', ask user for it.",
        },
        text: "Failed to extract Pendle parameters: unknown type",
      };
    }

    if (!amountIn) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: "Unknown amount",
        },
        text: "Failed to extract Pendle parameters: unknown amount",
      };
    }

    data.type = type;

    const tokenInData = await levvaService.token.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: tokenIn,
    });

    if (!tokenInData) {
      const unknownFromTokenText = `## ❓ Unknown Token

    **Token**: ${tokenIn}
    **Issue**: Token not found in our database

    Please provide a valid token symbol (like USDC, ETH, WETH) for the token you want to use for the transaction.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: unknownFromTokenText,
          error: "unknown_from_token",
        },
        text: unknownFromTokenText,
      };
    }

    data.tokenInData = tokenInData;

    const balance = await levvaService.getBalanceOf(
      user.address,
      chainId,
      tokenInData.address ?? ETH_NULL_ADDR
    );

    const amountUnits = parseUnits(String(amountIn ?? 0), tokenInData.decimals);

    if ((balance?.amount ?? 0n) < amountUnits) {
      const currentBalance = formatUnits(
        balance?.amount ?? 0n,
        tokenInData.decimals
      );
      // Use actual token decimals for shortfall display
      const tokenDecimals = tokenInData.decimals ?? 18;
      const insufficientBalanceText = `## ❌ Insufficient Balance

    **Token**: ${tokenInData.symbol} (${tokenInData.name})
    **Requested Amount**: ${amountIn} ${tokenInData.symbol}
    **Current Balance**: ${currentBalance} ${tokenInData.symbol}
    **Shortfall**: ${(parseFloat(amountIn!) - parseFloat(currentBalance)).toFixed(tokenDecimals)} ${tokenInData.symbol}

    You need more ${tokenInData.symbol} to complete this operation.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: insufficientBalanceText,
          fromTokenSymbol: tokenInData.symbol,
          amountIn: amountIn,
          error: "insufficient_balance",
        },
        text: insufficientBalanceText,
      };
    }

    data.amountIn = amountIn;

    let text = "";
    if (type === "buy") {
      text = `Buy PT ${pendleMarket.underlyingAssetName} for ${amountIn} ${data.tokenInData!.symbol!}`;
    } else if (type === "sell") {
      text = `Sell PT ${pendleMarket.underlyingAssetName} for ${amountIn} ${data.tokenInData!.symbol!}`;
    } else if (type === "deposit") {
      text = `Deposit ${amountIn} ${data.tokenInData!.symbol!} into Pendle pool`;
    } else if (type === "withdraw") {
      text = `Withdraw ${amountIn} ${data.tokenInData!.symbol!} from Pendle pool`;
    }

    // TODO: add something similar for Pendle strategy
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

    // Update intent context with extracted parameters if available
    if (intentContext && intentManager) {
      try {
        intentContext.returnData = {
          ...intentContext.returnData,
          tokenInData: data.tokenInData,
          pendleMarketAddress: data.pendleMarketAddress,
          amountIn: data.amountIn,
          type: data.type,
        };
        await intentManager.storeIntent(intentContext);
      } catch (error) {
        runtime.logger.warn(
          "Error updating intent context with Pendle strategy parameters:",
          error
        );
      }
    }

    return {
      ...EMPTY_RESULT,
      data: { ...data, intentContext },
      values: {
        strategy: text,
        tokenInData: data.tokenInData,
        pendleMarketAddress: data.pendleMarketAddress,
        amountIn: data.amountIn,
        type: data.type,
      },
      text,
    };
  },
};
