/**
 * Pendle strategy intent suggestions with progressive disclosure
 *
 * @version 1.0.0
 * @lastModified 2025-11-18
 * @changes v1.0.0: Initial implementation
 */

import { PendleMarket } from "../../api/levva/schema";
import { INTENT_TYPE } from "../../constants/enum";
import { PendleParamsProviderData } from "../../providers/pendle-params";
import type { IntentContext } from "../../services/intent-manager";
import { formatDecimalToPercentage } from "../../util";
import {
  generateIntentContextSection,
  generateOutputFormat,
  generateCommonInstructions,
} from "../helpers";
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
    userToken?: string;
    pendleToken?: string;
    amount?: string;
    maturity?: string;
    tokenClass?: string;
    maturityDays?: string;
    operationType?: string;
    [key: string]: any;
  };
  walletAsset?: {
    address: `0x${string}`;
    symbol: string;
    decimals: number;
    balance: bigint;
  };
  providerData?: PendleParamsProviderData;
  walletSupportedPendleMarketTokenSymbols?: string[];
  pendleFilteredMarkets: PendleMarket[];
  allPendleMarkets: PendleMarket[];
}

export function generatePendleStrategyIntentSuggestionsPrompt(
  params: PendleStrategyIntentSuggestionParams
): string {
  const {
    returnData,
    walletAsset,
    pendleFilteredMarkets,
    allPendleMarkets,
    userAddress,
    chainId,
    providerData,
    walletSupportedPendleMarketTokenSymbols,
  } = params;

  const { tokenClass, maturityDays } = returnData;

  if (walletSupportedPendleMarketTokenSymbols) {
    const intentContext = generateIntentContextSection({
      intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
      status:
        walletSupportedPendleMarketTokenSymbols.length === 0
          ? "Market selection needed"
          : "Token in selection needed",
      userAddress,
      chainId,
      parameters: {
        WalletToken: walletAsset?.symbol,
        PendleToken: providerData?.pendleTokenData?.symbol,
        Amount: providerData?.amount,
        TokenClass: tokenClass,
        MaturityDays: maturityDays,
        Type: providerData?.operationType,
      },
    });

    const suggestions =
      walletSupportedPendleMarketTokenSymbols.length === 0
        ? {
            labelDescription: "Use EXACT label format",
            textDescription: "Use EXACT text format",
            content: allPendleMarkets
              .sort((a, b) => b.liquidity - a.liquidity)
              .slice(0, 5)
              .map((market) => ({
                label: `PT-${market.underlyingAssetName}-${market.maturityDate.split("T")[0]} (APY: ${formatDecimalToPercentage(market.impliedApy)})`,
                text: `I want to select ${market.underlyingAssetName}`,
              })),
          }
        : {
            labelDescription: "Use EXACT label format",
            textDescription: "Use EXACT text format",
            content: walletSupportedPendleMarketTokenSymbols
              .slice(0, 5)
              .map((token) => ({
                label: `Use ${token}`,
                text: `Use ${token} from my portfolio instead`,
              })),
          };

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate natural, conversational suggestions for Pendle strategy selection.
  
  LABEL FORMAT (${suggestions!.labelDescription}):
  ${suggestions!.content.map((s) => `- "${s.label}"`).join("\n")}
  
  TEXT FORMAT (${suggestions!.textDescription}):
  ${suggestions!.content.map((s) => `- "${s.text}"`).join("\n")}
  
  Each suggestion MUST:
  - Be natural and conversational
  - Use EXACT labels and texts without modifications
  - MUST use information only from LABEL FORMAT AND TEXT FORMAT
  - Lead to amount selection and next steps
  `,
    });

    return `<task>Generate selection suggestions for Pendle strategy</task>
  ${intentContext}
  ${instructions}
  ${generateOutputFormat()}`;
  }

  if (
    pendleFilteredMarkets.length === 1 &&
    providerData?.operationType &&
    providerData?.userTokenData?.symbol &&
    providerData?.amount
  ) {
    const amounts = calculateAmountsFromBalance(
      walletAsset?.balance ?? 0n,
      walletAsset?.decimals ?? 18,
      walletAsset?.address
    );

    const intentContext = generateIntentContextSection({
      intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
      status: "Ready for confirmation",
      userAddress,
      chainId,
      parameters: {
        WalletToken: walletAsset?.symbol,
        PendleToken:
          providerData?.pendleTokenData?.symbol ??
          pendleFilteredMarkets[0]!.underlyingAssetName,
        Amount: providerData?.amount,
        TokenClass: tokenClass ?? pendleFilteredMarkets[0]!.underlyingType,
        MaturityDays: maturityDays ?? pendleFilteredMarkets[0]!.maturityDate,
        Type: providerData?.operationType,
        ...(amounts.hasBalance
          ? {
              "Available Balance": `${amounts.fullAmount} ${walletAsset?.symbol}`,
            }
          : {}),
      },
    });

    const amountContext = amounts.hasBalance
      ? `\nFor amount modifications, user has ${amounts.fullAmount} ${walletAsset?.symbol} available. Suggest specific amounts: ${amounts.amount25} ${walletAsset?.symbol}, ${amounts.amount50} ${walletAsset?.symbol}, ${amounts.amount75} ${walletAsset?.symbol}.`
      : "";

    // Build label examples
    const labelExamples = [
      `- "Confirm" - for confirmation`,
      `- "Retry" - for retry`,
    ];
    if (amounts.hasBalance) {
      labelExamples.push(
        `- "Use ${amounts.amount50} ${walletAsset?.symbol}" - for 50% amount`
      );
    } else {
      labelExamples.push(`- "Different amount" - for amount change`);
    }
    labelExamples.push(`- "Cancel" - for cancellation`);

    // Build text examples
    const textExamples = [
      `- "Yes, please proceed with the Pendle strategy" - confirmation`,
      `- "Let me retry this Pendle strategy" - retry after failure`,
    ];
    if (amounts.hasBalance) {
      textExamples.push(
        `- "Actually, buy/deposit ${amounts.amount50} ${walletAsset?.symbol} instead" - modify with specific amount`
      );
    } else {
      textExamples.push(
        `- "Actually, let me use a different amount" - modify amount`
      );
    }
    textExamples.push(`- "Cancel this Pendle strategy" - restart`);

    const instructions = generateCommonInstructions({
      suggestionType: "confirmation",
      specificInstructions: `Generate 3-4 natural, conversational suggestions for Pendle strategy confirmation:
${amountContext}

SUGGESTION PRIORITIES:
1. Confirm and proceed with the Pendle strategy
2. Retry if transaction failed
3. Adjust the amount with SPECIFIC amounts
4. Cancel and try different parameters

LABEL FORMAT (must be SPECIFIC for amount changes):
${labelExamples.join("\n")}

SUGGESTION FORMATS:
${textExamples.join("\n")}

Each suggestion should:
- Be natural and conversational
- Clearly indicate confirmation or modification intent
- Use SPECIFIC amounts in both label and text for modifications
- Reference the actual parameters when appropriate`,
    });

    return `<task>Generate confirmation suggestions for Pendle strategy - all parameters provided</task>
${intentContext}
${instructions}
${generateOutputFormat()}`;
  }

  if (!providerData?.operationType) {
    const intentContext = generateIntentContextSection({
      intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
      status: "Operation type selection needed (buy/sell/deposit/withdraw)",
      userAddress,
      chainId,
      parameters: {
        WalletToken: walletAsset?.symbol,
        PendleToken: providerData?.pendleTokenData?.symbol,
        Amount: providerData?.amount,
        TokenClass: tokenClass,
        MaturityDays: maturityDays,
        Type: providerData?.operationType,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate natural, conversational suggestions for operation type selection.

LABEL FORMAT:
- "Buy zero coupon bond" - for buy operation
- "Deposit liquidity" - for deposit operation
- "Sell PT token" - for sell operation
- "Withdraw liquidity" - for withdraw operation

TEXT FORMAT:
- "Buy Pendle PT token" - for buy operation
- "Deposit liquidity to Pendle pool" - for deposit operation
- "Sell PT token" - for sell operation
- "Withdraw liquidity" - for withdraw operation

Each suggestion MUST:
- Be natural and conversational
- Use EXACT labels and texts without modifications
- MUST use information only from LABEL FORMAT AND TEXT FORMAT
- Lead to amount selection and next steps
`,
    });

    return `<task>Generate amount suggestions for Pendle strategy</task>
${intentContext}
${instructions}
${generateOutputFormat()}`;
  }

  if (pendleFilteredMarkets.length > 1) {
    let suggestions:
      | {
          labelDescription: string;
          textDescription: string;
          content: { label: string; text: string }[];
        }
      | undefined;

    let intentContext: string;

    if (!tokenClass) {
      intentContext = generateIntentContextSection({
        intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
        status: "Token class selection needed",
        userAddress,
        chainId,
        parameters: {
          WalletToken: walletAsset?.symbol,
          PendleToken: providerData?.pendleTokenData?.symbol,
          Amount: providerData?.amount,
          TokenClass: tokenClass,
          MaturityDays: maturityDays,
          Type: providerData?.operationType,
        },
      });

      const tokenClassOptions = [
        ...new Set(pendleFilteredMarkets.map((m) => m.underlyingType)),
      ];

      suggestions = {
        labelDescription: "Token class selection",
        textDescription: "Token class: Stable, ETH, BTC",
        content: tokenClassOptions.map((type) => ({
          label: `${type} yield`,
          text: `${type} token class`,
        })),
      };
    } else if (!maturityDays) {
      intentContext = generateIntentContextSection({
        intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
        status: "Maturity days selection needed",
        userAddress,
        chainId,
        parameters: {
          WalletToken: walletAsset?.symbol,
          PendleToken: providerData?.pendleTokenData?.symbol,
          Amount: providerData?.amount,
          TokenClass: tokenClass,
          MaturityDays: maturityDays,
          Type: providerData?.operationType,
        },
      });

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

      suggestions = {
        labelDescription: "Maturity days selection",
        textDescription: "Maturity days: <=30, 30-90, >90",
        content: maturityDaysOptions.map((m) => {
          if (m === "<=30 days")
            return { label: "<=30 days", text: "Up to 30 days" };
          if (m === "30-90 days")
            return { label: "30-90 days", text: "30 to 90 days" };
          return { label: ">90 days", text: "More than 90 days" };
        }),
      };

      // text: "30 to 90 days",
      // text: "Up to 30 days",
      // text: "More than 90 days",
    } else {
      intentContext = generateIntentContextSection({
        intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
        status: "PT token selection needed",
        userAddress,
        chainId,
        parameters: {
          WalletToken: walletAsset?.symbol,
          PendleToken: providerData?.pendleTokenData?.symbol,
          Amount: providerData?.amount,
          TokenClass: tokenClass,
          MaturityDays: maturityDays,
          Type: providerData?.operationType,
        },
      });

      suggestions = {
        labelDescription: "Use EXACT label format",
        textDescription: "Use EXACT text format",
        content: pendleFilteredMarkets.slice(0, 5).map((market) => ({
          label: `PT-${market.underlyingAssetName}-${market.maturityDate.split("T")[0]} (APY: ${formatDecimalToPercentage(market.impliedApy)})`,
          text: `I want to select ${market.underlyingAssetName}`,
        })),
      };
    }

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate natural, conversational suggestions for Pendle strategy selection.

LABEL FORMAT (${suggestions!.labelDescription}):
${suggestions!.content.map((s) => `- "${s.label}"`).join("\n")}

TEXT FORMAT (${suggestions!.textDescription}):
${suggestions!.content.map((s) => `- "${s.text}"`).join("\n")}

Each suggestion MUST:
- Be natural and conversational
- Use EXACT labels and texts without modifications
- MUST use information only from LABEL FORMAT AND TEXT FORMAT
- Lead to amount selection and next steps
`,
    });

    return `<task>Generate selection suggestions for Pendle strategy</task>
${intentContext}
${instructions}
${generateOutputFormat()}`;
  }

  if (!providerData?.amount) {
    const intentContext = generateIntentContextSection({
      intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
      status: "Amount selection needed",
      userAddress,
      chainId,
      parameters: {
        WalletToken: walletAsset?.symbol,
        PendleToken: providerData?.pendleTokenData?.symbol,
        Amount: providerData?.amount,
        TokenClass: tokenClass,
        MaturityDays: maturityDays,
        Type: providerData?.operationType,
      },
    });

    const amounts = calculateAmountsFromBalance(
      walletAsset?.balance ?? 0n,
      walletAsset?.decimals ?? 18,
      walletAsset?.address
    );

    const { fullAmount, amount75, amount50, amount25 } = amounts;
    const amountContext = generateAmountContext(walletAsset?.symbol!, amounts);

    const gasNote = amounts.isNativeToken
      ? `\nIMPORTANT: ${walletAsset?.symbol} is native token - suggest max 95% to reserve gas for transaction.`
      : "";

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-4 natural, conversational suggestions for amount selection.

CRITICAL: The token symbol is "${walletAsset?.symbol}" - use ONLY this exact symbol, nothing else.
${amounts.hasBalance ? `User has ${fullAmount} ${walletAsset?.symbol} available in wallet${amounts.isNativeToken ? " (95% max to reserve gas)" : ""}.` : "No balance available."}${gasNote}

LABEL FORMAT (use specific amounts, NOT generic labels):
${
  amounts.hasBalance
    ? `- "Full balance" - for ${amounts.isNativeToken ? "95%" : "all"} ${walletAsset?.symbol}
- "75% of ${walletAsset?.symbol}" - for 75% of ${walletAsset?.symbol}
- "50% of ${walletAsset?.symbol}" - for 50% of ${walletAsset?.symbol}
- "25% of ${walletAsset?.symbol}" - for 25% of ${walletAsset?.symbol}`
    : `- You have no balance available`
}

TEXT FORMAT (use "${walletAsset?.symbol}" exactly as shown and ACTUAL amounts):
${
  amounts.hasBalance
    ? `- "I want to ${providerData?.operationType} ${fullAmount} ${walletAsset?.symbol}" - full ${amounts.isNativeToken ? "(95%)" : ""} balance
- "Use ${amount75} ${walletAsset?.symbol}" - 75% of balance
- "Use ${amount50} ${walletAsset?.symbol}" - 50% of balance
- "Use ${amount25} ${walletAsset?.symbol}" - 25% of balance`
    : `- You have no balance available`
}
- "What amount should I use?" - ask for guidance

Each suggestion MUST:
- Be natural and conversational
- Use ONLY the token symbol "${walletAsset?.symbol}" (no extra characters or variations)
- Provide specific amounts based on balance when available${amounts.isNativeToken ? "\n- Reserve 5% for gas if native token" : ""}
- Use EXACT labels and texts without modifications
- MUST use information only from LABEL FORMAT AND TEXT FORMAT
- Lead to confirmation step`,
    });

    return `<task>Generate amount suggestions for Pendle strategy</task>
${intentContext}
<userWallet>
${amountContext || "User has no supported tokens in wallet"}
</userWallet>
${instructions}
${generateOutputFormat()}`;
  }

  const intentContext = generateIntentContextSection({
    intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
    status: "Strategy selection needed",
    userAddress,
    chainId,
    parameters: {},
  });

  const ptTokensList = allPendleMarkets
    .map(
      (m) =>
        `- ${m.underlyingAssetName} (maturity: ${m.maturityDate.split("T")[0]}, class: ${m.underlyingType}, APY: ${formatDecimalToPercentage(m.impliedApy)})`
    )
    .join("\n");

  const instructions = generateCommonInstructions({
    suggestionType: "next-step",
    specificInstructions: `Generate 3-5 natural, conversational suggestions for Pendle strategy selection:

CRITICAL: All suggestions MUST include the word "${providerData?.operationType}" to clearly indicate intent to ${providerData?.operationType} PT token.

SUGGESTION PRIORITIES:
1. Select by PT token (specific tokens)
2. Ask about PT token recommendations
3. Inquire about PT token types (Stable, ETH, BTC)

SUGGESTION FORMATS (must include "${providerData?.operationType} PT"):
- "${providerData?.operationType} PT [Token Name]" - by specific token
- "What PT tokens do you recommend?" - ask for guidance
- "Tell me about PT token options" - learn more

Each suggestion should:
- Be natural and conversational
- **MUST include "${providerData?.operationType} PT" in the text**
- Reference actual available PT tokens
- Lead to PT token selection and next steps
- Use EXACT labels and texts without modifications`,
  });

  return `<task>Generate PT token selection suggestions for Pendle strategy</task>
${intentContext}
<pendleTokens>
${ptTokensList || "No PT tokens available"}
</pendleTokens>
${instructions}
${generateOutputFormat()}`;
}
