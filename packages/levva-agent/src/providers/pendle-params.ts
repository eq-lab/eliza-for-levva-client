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
  tokenOutData?: TokenDataWithInfo;
  pendleMarketAddress?: string;
  amountIn?: string;
  slippage?: string;
  type?: "buy" | "sell" | "deposit" | "withdraw";
  intentContext?: IntentContext;
}

export const PENDLE_PARAMS_PROVIDER_NAME = "PENDLE_PARAMS";

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
      const tokenPricesMap = new Map(
        tokenPrices.map((token) => [token.symbol.toLowerCase(), token.priceUsd])
      );

      pendleMarkets = (await levvaService.getPendleMarkets(chainId)) ?? [];

      // Filter non-zero balances and format with token info
      const portfolioEntries = walletAssets
        .filter((asset) => asset.amount > 0n)
        .map((asset) => {
          const token = tokens?.find(
            (t) =>
              t.address?.toLowerCase() === asset.token.toLowerCase() ||
              (asset.token === ETH_NULL_ADDR && t.symbol === "ETH")
          );
          const price =
            asset.token === ETH_NULL_ADDR
              ? tokenPricesMap.get("weth")
              : tokenPricesMap.get(token?.symbol?.toLowerCase() ?? "");
          const symbol =
            token?.symbol ||
            (asset.token === ETH_NULL_ADDR ? "ETH" : "Unknown");
          const decimals = token?.decimals ?? 18;
          const balance = formatUnits(asset.amount, decimals);
          const balanceUsd = price
            ? (price * Number(balance)).toFixed(2)
            : "0.00";
          return `{"token":"${symbol}","balance":"${balance}","usdValue":"${balanceUsd}"}`;
        })
        .join(",");

      const pendleAssets = pendleMarkets
        .map(
          (market) =>
            `{"ptToken":"${market.underlyingAssetName}","class":"${market.underlyingType}","maturity":"${market.maturityDate}"}`
        )
        .join(",");

      if (portfolioEntries) {
        userPortfolio = `[${portfolioEntries}]`;
      }

      if (pendleAssets.length > 0) {
        pendleTokens = `[${pendleAssets}]`;
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

    const data: PendleParamsProviderData = {};
    const { tokenIn, tokenOut, tokenClass, maturityDays, amountIn, type } =
      params;

    const pendleFilteredMarkets = await levvaService.filterPendleMarkets(
      pendleMarkets,
      tokenOut ?? undefined,
      maturityDays ?? undefined,
      tokenClass ?? undefined
    );

    if (pendleFilteredMarkets.length === 0) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: "No pendle markets found for the given parameters",
        },
        text: "Failed to extract Pendle parameters: no pendle markets found",
      };
    }

    if (pendleFilteredMarkets.length > 1) {
      if (!tokenClass) {
        return {
          ...EMPTY_RESULT,
          data: { ...data, intentContext },
          values: {
            strategy: "Unknown 'token class', ask user for it.",
          },
          text: "Failed to extract Pendle parameters: unknown PT token class",
        };
      }

      if (!maturityDays) {
        return {
          ...EMPTY_RESULT,
          data: { ...data, intentContext },
          values: {
            strategy: "Unknown 'maturity days', ask user for it.",
          },
          text: "Failed to extract Pendle parameters: unknown PT token maturity days",
        };
      }

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: "Unknown 'token out', ask user for it.",
        },
        text: "Failed to extract Pendle parameters: unknown token out",
      };
    }

    data.pendleMarketAddress = pendleFilteredMarkets[0]!.pendleMarketAddress;

    const pendleMarketTokens = await levvaService.getPendleMarketTokens(
      levvaProviderState.chainId,
      data.pendleMarketAddress as `0x${string}`
    );

    const tokenOutData = await levvaService.token.getTokenDataWithInfo({
      chainId: levvaProviderState.chainId,
      symbolOrAddress: pendleMarketTokens!.ptAddress,
    });

    const writeUnknownTokenText = (token: string) => `## ❓ Unknown Token

    **Token**: ${token}
    **Issue**: Token not found in our database

    Please provide a valid token symbol (like USDC, ETH, WETH) for the token you want to use for the transaction.`;

    if (!tokenOutData) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: writeUnknownTokenText(pendleMarketTokens!.ptAddress),
        },
        text: writeUnknownTokenText(pendleMarketTokens!.ptAddress),
      };
    }

    data.tokenOutData = tokenOutData;

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

    data.type = type;

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

    const tokenInData = await levvaService.token.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: tokenIn,
    });

    if (!tokenInData) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: writeUnknownTokenText(tokenIn),
          error: "unknown_from_token",
        },
        text: writeUnknownTokenText(tokenIn),
      };
    }

    tokenInData.address =
      tokenInData?.symbol == "ETH"
        ? ETH_NULL_ADDR
        : (tokenInData!.address! as `0x${string}`);

    data.tokenInData = tokenInData;

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

    const balance = await levvaService.wallet.getBalanceOf(
      user.address,
      chainId,
      tokenInData.address
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
          tokenInData: tokenInData,
          amountIn: amountIn,
          error: "insufficient_balance",
        },
        text: insufficientBalanceText,
      };
    }

    data.amountIn = amountIn;

    const userBalance = formatUnits(
      balance?.amount ?? 0n,
      tokenInData.decimals
    );
    const balanceInfo = `Current balance: ${userBalance} ${tokenInData.symbol}`;
    const formatTokenInfo = (token: TokenDataWithInfo) => {
      const isNative = !token.address || token.address === ETH_NULL_ADDR;
      return `${token.symbol} (${token.name})${isNative ? " - Native token" : ` - ${token.address}`}`;
    };

    let text = "";

    if (type === "buy") {
      text = `## Buy PT Token 🔄

**From**: ${formatTokenInfo(tokenInData)}
**To**: ${formatTokenInfo(tokenOutData)}
**Amount**: ${data.amountIn} ${tokenInData.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to buy ${data.amountIn} ${tokenInData.symbol} to ${tokenOutData.symbol} on Pendle.`;
    } else if (type === "sell") {
      // TODO: implement sell type
      throw new Error("Sell type is not supported yet");
    } else if (type === "deposit") {
      // TODO: implement deposit type
      throw new Error("Deposit type is not supported yet");
    } else if (type === "withdraw") {
      // TODO: implement withdraw type
      throw new Error("Withdraw type is not supported yet");
    }

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
