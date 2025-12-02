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

export interface PendleParamsProviderData {
  userTokenData?: TokenDataWithInfo;
  pendleTokenData?: TokenDataWithInfo;
  pendleMarketAddress?: string;
  amount?: string;
  slippage?: string;
  operationType?: "buy" | "sell" | "deposit" | "withdraw";
  pendleFilteredMarkets?: PendleMarket[];
  walletSupportedPendleMarketTokenSymbols?: string[];
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
      asset: BalanceData;
      token: Token | undefined;
    }[] = [];

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

      walletTokens = walletAssets
        .filter((asset) => asset.amount > 0n)
        .map((asset) => {
          const token = tokens?.find(
            (t) =>
              t.address?.toLowerCase() === asset.token.toLowerCase() ||
              (asset.token === ETH_NULL_ADDR && t.symbol === "ETH")
          );
          return { asset, token };
        });

      // Filter non-zero balances and format with token info
      const portfolioEntries = walletTokens
        .map(({ asset, token }) => {
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
          return `('${symbol}','${balance}','${balanceUsd}')`;
        })
        .join(",");

      const pendleAssets = pendleMarkets
        .map(
          (market) =>
            `('${market.underlyingAssetName}','${market.underlyingType}')`
        )
        .join(",");

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
      userToken,
      pendleToken,
      tokenClass,
      maturityDays,
      amount,
      operationType,
      slippage,
    } = params;

    if (amount) {
      data.amount = amount;
    }

    if (operationType) {
      data.operationType = operationType;
    }

    data.slippage = slippage ?? "0.005";

    const pendleFilteredMarkets = await levvaService.filterPendleMarkets(
      pendleMarkets,
      pendleToken ?? undefined,
      maturityDays ?? undefined,
      tokenClass ?? undefined
    );

    if (pendleFilteredMarkets.length > 0) {
      data.pendleFilteredMarkets = pendleFilteredMarkets;
    } else {
      data.pendleFilteredMarkets = [];
    }

    if (pendleFilteredMarkets.length == 1) {
      data.pendleMarketAddress = pendleFilteredMarkets[0].poolAddress;
    }

    if (data.userTokenData?.symbol !== userToken) {
      let userTokenData = userToken
        ? await levvaService.token.getTokenDataWithInfo({
            chainId,
            symbolOrAddress: userToken,
            skipUpsert: true,
          })
        : undefined;

      if (userTokenData) {
        userTokenData.address =
          userTokenData?.symbol == "ETH"
            ? ETH_NULL_ADDR
            : (userTokenData!.address! as `0x${string}`);

        data.userTokenData = userTokenData;
      }
    }

    if (
      pendleFilteredMarkets.length === 1 &&
      data.pendleTokenData?.symbol !== pendleToken
    ) {
      let tokenAddress: string | undefined;

      data.pendleMarketAddress = pendleFilteredMarkets[0]!.pendleMarketAddress;

      if (
        operationType === "buy" ||
        operationType === "deposit" ||
        operationType === "sell"
      ) {
        const pendleMarketTokens = await levvaService.getPendleMarketTokens(
          levvaProviderState.chainId,
          data.pendleMarketAddress as `0x${string}`
        );
        tokenAddress = pendleMarketTokens!.ptAddress;
      } else if (operationType === "withdraw") {
        tokenAddress = data.pendleMarketAddress;
      }

      const pendleTokenData = await levvaService.token.getTokenDataWithInfo({
        chainId: levvaProviderState.chainId,
        symbolOrAddress: tokenAddress,
        skipUpsert: true,
      });

      if (pendleTokenData) {
        data.pendleTokenData = pendleTokenData;
      }

      if (operationType === "sell" || operationType === "withdraw") {
        const pendleSupportedTokens =
          await levvaService.getPendleMarketSupportedTokens(
            chainId,
            data.pendleMarketAddress! as `0x${string}`
          );

        const isSupportedTokenOut = data.userTokenData
          ? pendleSupportedTokens.tokensOut.some(
              (t) =>
                t.toLowerCase() === data.userTokenData?.address?.toLowerCase()
            )
          : false;

        if (!isSupportedTokenOut) {
          const userTokens = new Set(
            walletTokens.map((wt) => wt.token?.address?.toLowerCase())
          );
          const targetToken = pendleSupportedTokens.tokensOut.find((t) =>
            userTokens.has(t.toLowerCase())
          );

          data.userTokenData = await levvaService.token.getTokenDataWithInfo({
            chainId,
            symbolOrAddress:
              targetToken ?? pendleSupportedTokens.tokensOut[0]?.toLowerCase(),
            skipUpsert: true,
          });
        }
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

    if (!data.pendleTokenData) {
      const writeUnknownTokenText = (token: string) => `## ❓ Unknown Token

**Token**: ${token}
**Issue**: Token not found in our database

Please provide a valid token symbol (like USDC, ETH, WETH) for the token you want to use for the transaction.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: writeUnknownTokenText(
            pendleFilteredMarkets[0].underlyingAssetName
          ),
        },
        text: writeUnknownTokenText(
          pendleFilteredMarkets[0].underlyingAssetName
        ),
      };
    }

    if (!data.userTokenData) {
      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy:
            "Please provide the token you want to use for the transaction.",
        },
        text: "Failed to extract Pendle parameters: unknown token in",
      };
    }

    const pendleSupportedTokens =
      await levvaService.getPendleMarketSupportedTokens(
        chainId,
        data.pendleMarketAddress! as `0x${string}`
      );

    const pendleSupportedInTokens = new Set(
      pendleSupportedTokens.tokensIn.map((t) => t.toLowerCase())
    );

    if (
      (operationType == "buy" || operationType == "deposit") &&
      !pendleSupportedInTokens.has(data.userTokenData.address!.toLowerCase())
    ) {
      const unknownToken = data.userTokenData?.symbol;
      data.userTokenData = undefined;

      const tokens = walletTokens
        .filter((wt) =>
          pendleSupportedInTokens.has(wt.asset.token.toLowerCase())
        )
        .map((wt) => {
          const symbol =
            wt.token?.symbol ||
            (wt.asset.token === ETH_NULL_ADDR ? "ETH" : "Unknown");
          return symbol;
        });

      data.walletSupportedPendleMarketTokenSymbols = tokens;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: `${unknownToken} is not supported by Pendle router. ${tokens.length > 0 ? `Please choose one of the supported tokens from your wallet: ${tokens.join(",")}` : "There is not supported token in your wallet. Please choose other Pendle market."}`,
        },
        text: `${unknownToken} is not supported by Pendle router. Select other token in.`,
      };
    } else {
      data.walletSupportedPendleMarketTokenSymbols = undefined;
    }

    const walletTokenData =
      data.operationType === "buy" || data.operationType === "deposit"
        ? data.userTokenData
        : data.pendleTokenData;

    const balance = await levvaService.wallet.getBalanceOf(
      user.address,
      chainId,
      walletTokenData.address!
    );

    const amountUnits = parseUnits(
      String(amount ?? 0),
      walletTokenData.decimals
    );

    if (balance?.amount === 0n || (balance?.amount ?? 0n) < amountUnits) {
      data.amount = undefined;

      const currentBalance = formatUnits(
        balance?.amount ?? 0n,
        walletTokenData.decimals
      );
      // Use actual token decimals for shortfall display
      const tokenDecimals = walletTokenData.decimals ?? 18;
      const insufficientBalanceText = `## ❌ Insufficient Balance

**Token**: ${walletTokenData.symbol} (${walletTokenData.name})
${amount ? `**Requested Amount**: ${amount} ${walletTokenData.symbol}` : ""}
**Current Balance**: ${currentBalance} ${walletTokenData.symbol}
${amount ? `**Shortfall**: ${(parseFloat(amount!) - parseFloat(currentBalance)).toFixed(tokenDecimals)} ${walletTokenData.symbol}` : ""}

You need more ${walletTokenData.symbol} to complete this operation.`;

      return {
        ...EMPTY_RESULT,
        data: { ...data, intentContext },
        values: {
          strategy: insufficientBalanceText,
          userTokenData: walletTokenData,
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
            `${data.userTokenData.symbol} from your wallet has been selected as the token to use for the transaction.` +
            `\nYou can change the token by explicitly mentioning the token you want to use.` +
            `\nPlease provide the amount of ${data.userTokenData.symbol} you want to use.`,
        },
        text: "Failed to extract Pendle parameters: unknown amount",
      };
    }

    const userBalance = formatUnits(
      balance?.amount ?? 0n,
      walletTokenData.decimals
    );
    const balanceInfo = `Current balance: ${userBalance} ${walletTokenData.symbol}`;
    const formatTokenInfo = (token: TokenDataWithInfo) => {
      const isNative = !token.address || token.address === ETH_NULL_ADDR;
      return `${token.symbol} (${token.name})${isNative ? " - Native token" : ` - ${token.address}`}`;
    };

    let text = "";

    if (operationType === "buy") {
      text = `## Buy PT Token 🔄

**From**: ${formatTokenInfo(walletTokenData)}
**To**: ${formatTokenInfo(data.pendleTokenData)}
**Amount**: ${data.amount} ${walletTokenData.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to deposit ${data.amount} ${walletTokenData.symbol} to ${data.pendleTokenData.symbol} on Pendle.`;
    } else if (operationType === "deposit") {
      text = `## Add liquidity to Pendle pool 🔄

**From**: ${formatTokenInfo(walletTokenData)}
**To**: LP ${formatTokenInfo(data.pendleTokenData)}
**Amount**: ${data.amount} ${walletTokenData.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to add liquidity ${data.amount} ${walletTokenData.symbol} to LP ${data.pendleTokenData.symbol} on Pendle.`;
    } else if (operationType === "sell") {
      text = `## Sell PT Token 🔄

**From**: PT ${formatTokenInfo(data.pendleTokenData)}
**To**: ${formatTokenInfo(walletTokenData)}
**Amount**: ${data.amount} ${data.pendleTokenData.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to sell ${data.amount} PT ${data.pendleTokenData.symbol} to ${walletTokenData.symbol} on Pendle.`;
    } else if (operationType === "withdraw") {
      text = `## Withdraw from Pendle pool 🔄

**From**: LP ${formatTokenInfo(data.pendleTokenData)}
**To**: ${formatTokenInfo(walletTokenData)}
**Amount**: ${data.amount} LP ${data.pendleTokenData.symbol}
**${balanceInfo}**
**Platform**: Pendle

User wants to withdraw ${data.amount} LP ${data.pendleTokenData.symbol} from Pendle pool.`;
    }

    // Update intent context with extracted parameters if available
    if (intentContext && intentManager) {
      try {
        intentContext.returnData = {
          ...intentContext.returnData,
          userTokenData: data.userTokenData,
          pendleTokenData: data.pendleTokenData,
          pendleMarketAddress: data.pendleMarketAddress,
          amount: data.amount,
          operationType: data.operationType,
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
        pendleTokenData: data.pendleTokenData,
        userTokenData: data.userTokenData,
        pendleMarketAddress: data.pendleMarketAddress,
        amount: data.amount,
        operationType: data.operationType,
        slippage: data.slippage,
      },
      text,
    };
  },
};
