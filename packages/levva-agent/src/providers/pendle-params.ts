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
import { LEVVA_PROVIDER_NAME, LevvaProviderState, Token } from "./index";
import { EMPTY_RESULT, selectProviderState, checkSimpleReply } from "./util";
import { IntentManager, IntentContext } from "../services/intent-manager";
import { zodJsonSchema } from "../prompts/util";
import { PendleMarket } from "../api/levva/schema";
import { TokenDataWithInfo } from "../types/token";
import { BalanceData } from "../services/levva/wallet";
import { toPendleDetails, toPendleSymbol } from "../services/levva/pendle";

export interface PendleParamsProviderData {
  tokenInData?: TokenDataWithInfo;
  tokenOutData?: TokenDataWithInfo;
  amount?: string;
  slippage?: string;
  operationType?: "buy" | "sell" | "deposit" | "withdraw";
  pendleFilteredMarkets?: PendleMarket[];
  thought?: string;
  supportedTokensIn?: { token: Token; balance: number }[];
  supportedTokensOut?: { token: Token; balance: number }[];
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
    let walletTokens: {
      asset: BalanceData | undefined;
      token: Token;
      balance: number;
      balanceUsd: string | number;
    }[] = [];

    try {
      pendleMarkets = (await levvaService.getPendleMarkets(chainId)) ?? [];

      await levvaService.collectPendleMarketPtAndLpTokens(
        chainId,
        pendleMarkets
      );

      const walletAssets = await levvaService.wallet.getWalletAssets({
        chainId,
        address: user.address,
      });
      const tokenPrices = await levvaService.token.getTokensPrices(chainId);
      const tokenPricesMap = new Map(
        tokenPrices.map((token) => [token.symbol.toLowerCase(), token.priceUsd])
      );

      walletTokens = tokens.map((token) => {
        const asset = walletAssets.find(
          (a) =>
            token.address?.toLowerCase() === a.token.toLowerCase() ||
            (a.token === ETH_NULL_ADDR && token.symbol === "ETH")
        );
        const symbol =
          token.symbol || (asset?.token === ETH_NULL_ADDR ? "ETH" : "Unknown");
        const price =
          asset?.token === ETH_NULL_ADDR
            ? tokenPricesMap.get("weth")
            : tokenPricesMap.get(token.symbol?.toLowerCase() ?? "");
        const decimals = token.decimals ?? 18;
        const balance = +formatUnits(asset?.amount ?? 0n, decimals);
        const balanceUsd = price ? (price * Number(balance)).toFixed(2) : 0;

        return {
          asset,
          token: { ...token, symbol },
          balance,
          balanceUsd,
        };
      });

      // Filter non-zero balances and format with token info
      const portfolioEntries = walletTokens
        .map(({ token, balance }) => {
          return `${balance} ${token!.symbol}`;
        })
        .join("\n");

      const pendleAssets = pendleMarkets
        .map((market) => `${market.underlyingAssetSymbol}`)
        .join("\n");

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
          currentMessage: message.content.text,
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
          currentMessage: message.content.text,
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

    if (!pendleTokens || pendleMarkets.length === 0) {
      return {
        ...EMPTY_RESULT,
        text: `No Pendle markets found. Please try again later.`,
      };
    }

    const data: PendleParamsProviderData = {};
    const {
      tokenIn,
      tokenOut,
      tokenClass,
      maturityDays,
      amount,
      operationType,
      slippage,
    } = params;

    data.thought = undefined;
    data.supportedTokensIn = undefined;
    data.supportedTokensOut = undefined;

    if (amount) {
      data.amount = amount;
    }

    if (operationType) {
      data.operationType = operationType;
    }

    data.slippage = slippage ?? "0.005";

    let pendleMarketSymbol: string | undefined;
    let pendleMarketDetails:
      | { maturityDate: string; underlyingAssetSymbol: string }
      | undefined;

    if (operationType === "buy" || operationType === "deposit") {
      pendleMarketSymbol = tokenOut ?? undefined;
    } else if (operationType === "sell" || operationType === "withdraw") {
      pendleMarketDetails = tokenIn ? toPendleDetails(tokenIn) : undefined;
    }

    const pendleFilteredMarkets = await levvaService.filterPendleMarkets(
      pendleMarkets,
      pendleMarketDetails?.underlyingAssetSymbol ??
        pendleMarketSymbol ??
        undefined,
      pendleMarketDetails?.maturityDate ?? maturityDays ?? undefined,
      tokenClass ?? undefined
    );

    if (pendleFilteredMarkets.length > 0) {
      data.pendleFilteredMarkets = pendleFilteredMarkets;
    } else {
      data.pendleFilteredMarkets = [];
    }

    if (tokenIn && tokenIn !== data.tokenInData?.symbol) {
      let tokenInData = await levvaService.token.getTokenDataWithInfo({
        chainId,
        symbolOrAddress: tokenIn,
        skipUpsert: true,
      });

      if (tokenInData) {
        data.tokenInData = tokenInData;
      }
    }

    if (
      (operationType === "sell" || operationType === "withdraw") &&
      pendleFilteredMarkets.length === 1
    ) {
      const pendleMarketDetails = await levvaService.getPendleMarketDetails(
        chainId,
        pendleFilteredMarkets[0].pendleMarketAddress as `0x${string}`
      );

      data.tokenOutData = await levvaService.token.getTokenDataWithInfo({
        chainId,
        symbolOrAddress: pendleMarketDetails.underlyingAsset,
        skipUpsert: true,
      });
    }

    if (tokenOut && tokenOut !== data.tokenOutData?.symbol) {
      if (operationType === "buy" && pendleFilteredMarkets.length === 1) {
        const { pt } = toPendleSymbol(pendleFilteredMarkets[0]);

        data.tokenOutData = await levvaService.token.getTokenDataWithInfo({
          chainId,
          symbolOrAddress: pt,
          skipUpsert: true,
        });
      } else if (
        operationType === "deposit" &&
        pendleFilteredMarkets.length === 1
      ) {
        const { lp } = toPendleSymbol(pendleFilteredMarkets[0]);

        data.tokenOutData = await levvaService.token.getTokenDataWithInfo({
          chainId,
          symbolOrAddress: lp,
          skipUpsert: true,
        });
      }
    }

    if (!data.operationType) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: "Please provide the operation type for the Pendle market.",
        },
        text: "Failed to extract Pendle parameters: unknown type",
      };
    }

    if (
      operationType === "sell" &&
      (!data.tokenInData || !data.tokenInData.symbol.startsWith("PT-"))
    ) {
      data.supportedTokensIn = walletTokens
        .filter(
          (wt) =>
            wt.asset &&
            wt.balance > 0 &&
            wt.token.symbol.match(/^PT-.+\d{2}[A-Z]{3}\d{4}$/i)
        )
        .map((wt) => ({ token: wt.token, balance: wt.balance }));

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy:
            "Please provide the Pendle PT token from your portfolio that you want to sell.",
        },
        text: "Failed to extract Pendle parameters: no Pendle PT token found",
      };
    }

    if (
      operationType === "withdraw" &&
      (!data.tokenInData || !data.tokenInData.symbol.startsWith("LP-"))
    ) {
      data.supportedTokensIn = walletTokens
        .filter(
          (wt) =>
            wt.asset &&
            wt.balance > 0 &&
            wt.token.symbol.match(/^LP-.+\d{2}[A-Z]{3}\d{4}$/i)
        )
        .map((wt) => ({ token: wt.token, balance: wt.balance }));

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy:
            "Please provide the Pendle LP token from your portfolio that you want to use for the withdrawal.",
        },
        text: "Failed to extract Pendle parameters: no Pendle LP token found",
      };
    }

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

    if (
      (data.operationType === "buy" || data.operationType === "deposit") &&
      pendleFilteredMarkets.length > 1
    ) {
      if (!tokenClass) {
        return {
          ...EMPTY_RESULT,
          data: { ...data, intentContext },
          values: {
            strategy: "Please provide the token class for the Pendle market.",
          },
          text: "Failed to extract Pendle parameters: unknown PT token class",
        };
      }

      if (!maturityDays) {
        return {
          ...EMPTY_RESULT,
          data: { ...data, intentContext },
          values: {
            strategy: "Please provide the maturity days for the Pendle market.",
          },
          text: "Failed to extract Pendle parameters: unknown PT token maturity days",
        };
      }

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy:
            "Select the Pendle market you want to use for the transaction.",
        },
        text: "Failed to extract Pendle parameters: unknown token out",
      };
    }

    const pendleSupportedTokens =
      await levvaService.getPendleMarketSupportedTokens(
        chainId,
        pendleFilteredMarkets[0].pendleMarketAddress as `0x${string}`
      );

    const pendleSupportedInTokens = new Set(
      pendleSupportedTokens.tokensIn.map((t) => t.toLowerCase())
    );

    const pendleSupportedOutTokens = new Set(
      pendleSupportedTokens.tokensOut.map((t) => t.toLowerCase())
    );

    // buy:      tokenIn => check tokensIn, tokenOut => PT token
    // deposit:  tokenIn => check tokensIn, tokenOut => LP token
    // sell:     tokenIn => PT token,       tokenOut => check tokensOut
    // withdraw: tokenIn => LP token,       tokenOut => check tokensOut

    if (
      (operationType == "buy" || operationType == "deposit") &&
      data.tokenInData &&
      !pendleSupportedInTokens.has(data.tokenInData.address!.toLowerCase())
    ) {
      const unknownToken = data.tokenInData?.symbol;

      const supportedTokensIn = walletTokens
        .filter(
          (wt) =>
            wt.asset &&
            pendleSupportedInTokens.has(wt.asset.token.toLowerCase())
        )
        .map((wt) => ({ token: wt.token, balance: wt.balance }));

      if (supportedTokensIn.length === 0) {
        data.thought = `${unknownToken} is not supported by Pendle router. Selecting first supported token in from Pendle router.`;
        data.tokenInData = await levvaService.token.getTokenDataWithInfo({
          chainId,
          symbolOrAddress: pendleSupportedTokens.tokensIn[0],
          skipUpsert: true,
        });
      } else {
        data.supportedTokensIn = supportedTokensIn;

        return {
          ...EMPTY_RESULT,
          data: { ...data, intentContext },
          values: {
            strategy: `${unknownToken} is not supported by Pendle router. Select other token in.`,
          },
          text: `${unknownToken} is not supported by Pendle router. Select other token in.`,
        };
      }
    } else if (
      (operationType == "sell" || operationType == "withdraw") &&
      data.tokenOutData &&
      !pendleSupportedOutTokens.has(data.tokenOutData.address!.toLowerCase())
    ) {
      const unknownToken = data.tokenOutData?.symbol;

      const supportedTokensOut = walletTokens
        .filter(
          (wt) =>
            wt.asset &&
            pendleSupportedOutTokens.has(wt.asset.token.toLowerCase())
        )
        .map((wt) => ({ token: wt.token, balance: wt.balance }));

      if (supportedTokensOut.length === 0) {
        data.thought = `${unknownToken} is not supported by Pendle router. Selecting first supported token out from Pendle router.`;
        data.tokenOutData = await levvaService.token.getTokenDataWithInfo({
          chainId,
          symbolOrAddress: pendleSupportedTokens.tokensOut[0],
          skipUpsert: true,
        });
      } else {
        data.supportedTokensOut = supportedTokensOut;

        return {
          ...EMPTY_RESULT,
          data: { ...data, intentContext },
          values: {
            strategy: `${unknownToken} is not supported by Pendle router. Select other token out.`,
          },
          text: `${unknownToken} is not supported by Pendle router. Select other token out.`,
        };
      }
    }

    if (!data.tokenInData) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy:
            "Please provide the token in you want to use for the transaction.",
        },
        text: "Failed to extract Pendle parameters: unknown token in",
      };
    }

    if (!data.tokenOutData) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy:
            "Please provide the token out you want to use for the transaction.",
        },
        text: "Failed to extract Pendle parameters: unknown token out",
      };
    }

    const balanceDataEntries = await levvaService.wallet.getBalancesWithPrices(
      user.address,
      chainId,
      [
        {
          address: data.tokenInData!.address!,
          decimals: data.tokenInData!.decimals,
        },
      ]
    );

    const balance =
      balanceDataEntries.length > 0 ? balanceDataEntries[0] : undefined;

    const amountUnits = parseUnits(
      String(amount ?? 0),
      data.tokenInData!.decimals
    );

    if (balance?.amount === 0n || (balance?.amount ?? 0n) < amountUnits) {
      data.amount = undefined;

      const currentBalance = formatUnits(
        balance?.amount ?? 0n,
        data.tokenInData!.decimals
      );
      // Use actual token decimals for shortfall display
      const tokenDecimals = data.tokenInData!.decimals ?? 18;
      const insufficientBalanceText = `## ❌ Insufficient Balance

**Token**: ${data.tokenInData!.symbol} (${data.tokenInData!.name})
${amount ? `**Requested Amount**: ${amount} ${data.tokenInData!.symbol}` : ""}
**Current Balance**: ${currentBalance} ${data.tokenInData!.symbol}
${amount ? `**Shortfall**: ${(parseFloat(amount!) - parseFloat(currentBalance)).toFixed(tokenDecimals)} ${data.tokenInData!.symbol}` : ""}

You need more ${data.tokenInData!.symbol} to complete this operation.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: insufficientBalanceText,
          tokenInData: data.tokenInData!,
          amount: amount,
          error: "insufficient_balance",
        },
        text: insufficientBalanceText,
      };
    }

    if (!amount) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy:
            `${data.tokenInData!.symbol} from your wallet has been selected as the token to use for the transaction.` +
            `\nYou can change the token by explicitly mentioning the token you want to use.` +
            `\nPlease provide the amount of ${data.tokenInData!.symbol} you want to use.`,
        },
        text: "Failed to extract Pendle parameters: unknown amount",
      };
    }

    const userBalance = formatUnits(
      balance?.amount ?? 0n,
      data.tokenInData!.decimals
    );
    const balanceInfo = `Current balance: ${userBalance} ${data.tokenInData!.symbol}`;
    const formatTokenInfo = (token: TokenDataWithInfo) => {
      const isNative = !token.address || token.address === ETH_NULL_ADDR;
      return `${token.symbol} (${token.name})${isNative ? " - Native token" : ` - ${token.address}`}`;
    };

    let text = "";

    if (operationType === "buy") {
      text = `## Buy PT Token 🔄

**From**: ${formatTokenInfo(data.tokenInData!)}
**To**: ${formatTokenInfo(data.tokenOutData!)}
**Amount**: ${data.amount} ${data.tokenInData!.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to deposit ${data.amount} ${data.tokenInData!.symbol} to ${data.tokenOutData!.symbol} on Pendle.`;
    } else if (operationType === "deposit") {
      text = `## Add liquidity to Pendle pool 🔄

**From**: ${formatTokenInfo(data.tokenInData!)}
**To**: ${formatTokenInfo(data.tokenOutData!)}
**Amount**: ${data.amount} ${data.tokenInData!.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to add liquidity ${data.amount} ${data.tokenInData!.symbol} to ${data.tokenOutData!.symbol} on Pendle.`;
    } else if (operationType === "sell") {
      text = `## Sell PT Token 🔄

**From**: ${formatTokenInfo(data.tokenInData!)}
**To**: ${formatTokenInfo(data.tokenOutData!)}
**Amount**: ${data.amount} ${data.tokenInData!.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to sell ${data.amount} ${data.tokenInData!.symbol} to ${data.tokenOutData!.symbol} on Pendle.`;
    } else if (operationType === "withdraw") {
      text = `## Withdraw from Pendle pool 🔄

**From**: ${formatTokenInfo(data.tokenInData!)}
**To**: ${formatTokenInfo(data.tokenOutData!)}
**Amount**: ${data.amount} ${data.tokenInData!.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to withdraw ${data.amount} ${data.tokenInData!.symbol} from Pendle pool.`;
    }

    // Update intent context with extracted parameters if available
    if (intentContext && intentManager) {
      try {
        intentContext.returnData = {
          ...intentContext.returnData,
          tokenInData: data.tokenInData!,
          tokenOutData: data.tokenOutData!,
          amount: data.amount,
          operationType: data.operationType,
          slippage: data.slippage,
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
        tokenInData: data.tokenInData!,
        tokenOutData: data.tokenOutData!,
        amount: data.amount,
        operationType: data.operationType,
        slippage: data.slippage,
      },
      text,
    };
  },
};
