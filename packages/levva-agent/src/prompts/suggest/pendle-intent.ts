/**
 * Pendle strategy intent suggestions with progressive disclosure
 *
 * @version 1.0.0
 * @lastModified 2025-11-18
 * @changes v1.0.0: Initial implementation
 */

import { PendleMarket } from "../../api/levva/schema";
import { Suggestion } from "../../evaluators/suggestions";
import { PendleParamsProviderData } from "../../providers/pendle-params";
import type { IntentContext } from "../../services/intent-manager";
import { formatDecimalToPercentage } from "../../util";
import { generateOutputFormat, generateCommonInstructions } from "../helpers";
import {
  calculateAmountsFromBalance,
  generateAmountContext,
} from "../helpers/amount-suggestions";

export interface PendleStrategyIntentSuggestionParams {
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
  returnData: {
    tokenClass?: string;
    tokenIn?: string;
    tokenOut?: string;
    maturityDays?: string;
    operationType?: string;
    amount?: string;
    slippage?: string;
    [key: string]: any;
  };
  walletAsset?: {
    address: `0x${string}`;
    symbol: string;
    decimals: number;
    balance: bigint;
  };
  providerData?: PendleParamsProviderData;
  pendleFilteredMarkets: PendleMarket[];
  allPendleMarkets: PendleMarket[];
}

export function generatePendleStrategyIntentSuggestions(
  params: PendleStrategyIntentSuggestionParams
): { suggestions: Suggestion[] } | undefined {
  const {
    returnData,
    walletAsset,
    pendleFilteredMarkets,
    userAddress,
    chainId,
    providerData,
  } = params;

  const { tokenClass, maturityDays } = returnData;

  if (
    providerData?.supportedTokensIn &&
    providerData.supportedTokensIn.length > 0
  ) {
    // const suggestions = {
    //   labelDescription: "Use EXACT label format",
    //   textDescription: "Use EXACT text format",
    //   content: providerData.supportedTokensIn!.slice(0, 5).map((token) => ({
    //     label: `Use ${token.token.symbol}`,
    //     text: `Use ${token.token.symbol} for token in`,
    //   })),
    // };
  }

  if (
    pendleFilteredMarkets.length === 1 &&
    providerData?.operationType &&
    providerData?.tokenInData?.symbol &&
    providerData?.tokenOutData?.symbol &&
    providerData?.amount
  ) {
    //     const amounts = calculateAmountsFromBalance(
    //       walletAsset?.balance ?? 0n,
    //       walletAsset?.decimals ?? 18,
    //       walletAsset?.address
    //     );
    //     const amountContext = amounts.hasBalance
    //       ? `\nFor amount modifications, user has ${amounts.fullAmount} ${walletAsset?.symbol} available. Suggest specific amounts: ${amounts.amount25} ${walletAsset?.symbol}, ${amounts.amount50} ${walletAsset?.symbol}, ${amounts.amount75} ${walletAsset?.symbol}.`
    //       : "";
    //     // Build label examples
    //     const labelExamples = [
    //       `- "Confirm" - for confirmation`,
    //       `- "Retry" - for retry`,
    //     ];
    //     if (amounts.hasBalance) {
    //       labelExamples.push(
    //         `- "Use ${amounts.amount50} ${walletAsset?.symbol}" - for 50% amount`
    //       );
    //     } else {
    //       labelExamples.push(`- "Different amount" - for amount change`);
    //     }
    //     labelExamples.push(`- "Cancel" - for cancellation`);
    //     // Build text examples
    //     const textExamples = [
    //       `- "Yes, please proceed with the Pendle strategy" - confirmation`,
    //       `- "Let me retry this Pendle strategy" - retry after failure`,
    //     ];
    //     if (amounts.hasBalance) {
    //       textExamples.push(
    //         `- "Actually, buy/deposit ${amounts.amount50} ${walletAsset?.symbol} instead" - modify with specific amount`
    //       );
    //     } else {
    //       textExamples.push(
    //         `- "Actually, let me use a different amount" - modify amount`
    //       );
    //     }
    //     textExamples.push(`- "Cancel this Pendle strategy" - restart`);
    //     const instructions = generateCommonInstructions({
    //       suggestionType: "confirmation",
    //       specificInstructions: `Generate 3-4 natural, conversational suggestions for Pendle strategy confirmation:
    // ${amountContext}
    // SUGGESTION PRIORITIES:
    // 1. Confirm and proceed with the Pendle strategy
    // 2. Retry if transaction failed
    // 3. Adjust the amount with SPECIFIC amounts
    // 4. Cancel and try different parameters
    // LABEL FORMAT (must be SPECIFIC for amount changes):
    // ${labelExamples.join("\n")}
    // SUGGESTION FORMATS:
    // ${textExamples.join("\n")}
    // Each suggestion should:
    // - Be natural and conversational
    // - Clearly indicate confirmation or modification intent
    // - Use SPECIFIC amounts in both label and text for modifications
    // - Reference the actual parameters when appropriate`,
    //     });
    //     return `<task>Generate confirmation suggestions for Pendle strategy - all parameters provided</task>
    // ${intentContext}
    // ${instructions}
    // ${generateOutputFormat()}`;
  }

  if (!providerData?.operationType) {
    //     const instructions = generateCommonInstructions({
    //       suggestionType: "next-step",
    //       specificInstructions: `Generate natural, conversational suggestions for operation type selection.
    // LABEL FORMAT:
    // - "Buy zero coupon bond" - for buy operation
    // - "Deposit liquidity" - for deposit operation
    // - "Sell PT token" - for sell operation
    // - "Withdraw liquidity" - for withdraw operation
    // TEXT FORMAT:
    // - "Buy Pendle PT token" - for buy operation
    // - "Deposit liquidity to Pendle pool" - for deposit operation
    // - "Sell PT token" - for sell operation
    // - "Withdraw liquidity" - for withdraw operation
    // Each suggestion MUST:
    // - Be natural and conversational
    // - Use EXACT labels and texts without modifications
    // - MUST use information only from LABEL FORMAT AND TEXT FORMAT
    // - Lead to amount selection and next steps
    // `,
    //     });
    //     return `<task>Generate amount suggestions for Pendle strategy</task>
    // ${intentContext}
    // ${instructions}
    // ${generateOutputFormat()}`;
  }

  if (
    (providerData?.operationType === "buy" ||
      providerData?.operationType === "deposit") &&
    pendleFilteredMarkets.length > 1
  ) {
    if (!tokenClass) {
      const tokenClassOptions = [
        ...new Set(pendleFilteredMarkets.map((m) => m.underlyingType)),
      ];

      return {
        suggestions: tokenClassOptions.map((type) => ({
          type: "pendle-asset-class",
          label: `${type} yield`,
          text: `${type} token class`,
        })),
      };
    } else if (!maturityDays) {
      const utcNowDate = Date.now();
      const utcNowDateInMsec = Math.floor(
        utcNowDate - Math.floor(utcNowDate % 86400000)
      );

      const maturityDaysOptions = [
        ...new Set(
          pendleFilteredMarkets.map((m) => {
            const maturityDate = new Date(m.maturityDate);
            const daysUntilMaturity = Math.ceil(
              (maturityDate.getTime() - utcNowDateInMsec) / 86400000
            );

            if (daysUntilMaturity <= 30) return "<=30 days";
            if (daysUntilMaturity > 30 && daysUntilMaturity <= 90)
              return "30-90 days";
            return ">90 days";
          })
        ),
      ];

      return {
        suggestions: maturityDaysOptions.map((m) => {
          if (m === "<=30 days")
            return {
              type: "pendle-maturities",
              label: "<=30 days",
              text: "Up to 30 days",
            };
          if (m === "30-90 days")
            return {
              type: "pendle-maturities",
              label: "30-90 days",
              text: "30 to 90 days",
            };
          return {
            type: "pendle-maturities",
            label: ">90 days",
            text: "More than 90 days",
          };
        }),
      };
    } else {
      return {
        suggestions: pendleFilteredMarkets.slice(0, 5).map((market) => ({
          type: "pendle-market",
          label: `PT-${market.underlyingAssetSymbol}-${market.maturityDate.split("T")[0]} (APY: ${formatDecimalToPercentage(market.impliedApy)})`,
          text: `I want to select ${market.underlyingAssetSymbol}`,
        })),
      };
    }
  }

  if (
    !providerData?.amount &&
    providerData?.tokenInData &&
    providerData?.tokenOutData
  ) {
    //     const amounts = calculateAmountsFromBalance(
    //       walletAsset?.balance ?? 0n,
    //       walletAsset?.decimals ?? 18,
    //       walletAsset?.address
    //     );
    //     const { fullAmount, amount75, amount50, amount25 } = amounts;
    //     const amountContext = generateAmountContext(
    //       walletAsset?.symbol ?? "",
    //       amounts
    //     );
    //     const gasNote = amounts.isNativeToken
    //       ? `\nIMPORTANT: ${walletAsset?.symbol} is native token - suggest max 95% to reserve gas for transaction.`
    //       : "";
    //     const instructions = generateCommonInstructions({
    //       suggestionType: "next-step",
    //       specificInstructions: `Generate 3-4 natural, conversational suggestions for amount selection.
    // CRITICAL: The token symbol is "${walletAsset?.symbol}" - use ONLY this exact symbol, nothing else.
    // ${amounts.hasBalance ? `User has ${fullAmount} ${walletAsset?.symbol} available in wallet${amounts.isNativeToken ? " (95% max to reserve gas)" : ""}.` : "No balance available."}${gasNote}
    // LABEL FORMAT (use specific amounts, NOT generic labels):
    // ${
    //   amounts.hasBalance
    //     ? `- "Full balance" - for ${amounts.isNativeToken ? "95%" : "all"} ${walletAsset?.symbol}
    // - "75% of ${walletAsset?.symbol}" - for 75% of ${walletAsset?.symbol}
    // - "50% of ${walletAsset?.symbol}" - for 50% of ${walletAsset?.symbol}
    // - "25% of ${walletAsset?.symbol}" - for 25% of ${walletAsset?.symbol}`
    //     : `- You have no balance available`
    // }
    // TEXT FORMAT (use "${walletAsset?.symbol}" exactly as shown and ACTUAL amounts):
    // ${
    //   amounts.hasBalance
    //     ? `- "I want to ${providerData?.operationType} ${fullAmount} ${walletAsset?.symbol}" - full ${amounts.isNativeToken ? "(95%)" : ""} balance
    // - "Use ${amount75} ${walletAsset?.symbol}" - 75% of balance
    // - "Use ${amount50} ${walletAsset?.symbol}" - 50% of balance
    // - "Use ${amount25} ${walletAsset?.symbol}" - 25% of balance`
    //     : `- You have no balance available`
    // }
    // Each suggestion MUST:
    // - Be natural and conversational
    // - Use ONLY the token symbol "${walletAsset?.symbol}" (no extra characters or variations)
    // - Provide specific amounts based on balance when available${amounts.isNativeToken ? "\n- Reserve 5% for gas if native token" : ""}
    // - Use EXACT labels and texts without modifications
    // - MUST use information only from LABEL FORMAT AND TEXT FORMAT
    // - Lead to confirmation step`,
    //     });
    //     return `<task>Generate amount suggestions for Pendle strategy</task>
    // ${intentContext}
    // <userWallet>
    // ${amountContext || "User has no supported tokens in wallet"}
    // </userWallet>
    // ${instructions}
    // ${generateOutputFormat()}`;
  }
}
