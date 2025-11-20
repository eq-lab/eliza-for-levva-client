/**
 * Pendle strategy intent suggestions with progressive disclosure
 *
 * @version 1.0.0
 * @lastModified 2025-11-18
 * @changes v1.0.0: Initial implementation
 */

import { PendleMarket } from "../../api/levva/schema";
import { INTENT_TYPE } from "../../constants/enum";
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
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: string;
    maturity?: string;
    tokenClass?: string;
    maturityDays?: string;
    type?: string;
    [key: string]: any;
  };
  walletAssets: Array<{
    address: string;
    symbol: string;
    balance: bigint;
    decimals: number;
    balanceUsd: string;
  }>;
  pendleFilteredMarkets: PendleMarket[];
  allPendleMarkets: PendleMarket[];
}

export function generatePendleStrategyIntentSuggestionsPrompt(
  params: PendleStrategyIntentSuggestionParams
): string {
  const {
    returnData,
    walletAssets,
    pendleFilteredMarkets,
    allPendleMarkets,
    conversation,
    userAddress,
    chainId,
  } = params;

  const { tokenIn, tokenOut, amountIn, tokenClass, maturityDays, type } =
    returnData;

  if (pendleFilteredMarkets.length === 1 && type && tokenIn && amountIn) {
    const walletAsset = walletAssets.find(
      (a) => a.symbol.toLowerCase() === tokenIn.toLowerCase()
    );

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
        From: tokenIn,
        To: tokenOut ?? pendleFilteredMarkets[0]!.underlyingAssetName,
        Amount: amountIn,
        TokenClass: tokenClass ?? pendleFilteredMarkets[0]!.underlyingType,
        MaturityDays: maturityDays ?? pendleFilteredMarkets[0]!.maturityDate,
        Type: type,
        ...(amounts.hasBalance
          ? { "Available Balance": `${amounts.fullAmount} ${tokenIn}` }
          : {}),
      },
    });

    const amountContext = amounts.hasBalance
      ? `\nFor amount modifications, user has ${amounts.fullAmount} ${tokenIn} available. Suggest specific amounts: ${amounts.amount50} ${tokenIn}, ${amounts.amount75} ${tokenIn}.`
      : "";

    // Build label examples
    const labelExamples = [
      `- "Confirm" - for confirmation`,
      `- "Retry" - for retry`,
    ];
    if (amounts.hasBalance) {
      labelExamples.push(
        `- "Buy ${amounts.amount50} ${tokenIn}" - for 50% amount`
      );
    } else {
      labelExamples.push(`- "Different amount" - for amount change`);
    }
    labelExamples.push(`- "Cancel" - for cancellation`);

    // Build text examples
    const textExamples = [
      `- "Yes, please proceed with the Pendle strategy" - confirmation`,
      `- "Let me retry this Pendle strategy" - retry after failure`,
      `- "Buy ${amountIn} ${tokenIn} to ${tokenOut ?? pendleFilteredMarkets[0]!.underlyingAssetName}" - explicit confirmation`,
    ];
    if (amounts.hasBalance) {
      textExamples.push(
        `- "Actually, buy ${amounts.amount50} ${tokenIn} instead" - modify with specific amount`
      );
    } else {
      textExamples.push(
        `- "Actually, let me buy a different amount" - modify amount`
      );
    }
    textExamples.push(`- "Cancel and buy something else" - restart`);

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
<conversation>
${conversation}
</conversation>
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
          From: tokenIn,
          Amount: amountIn,
          TokenClass: tokenClass ?? pendleFilteredMarkets[0]!.underlyingType,
          MaturityDays: maturityDays ?? pendleFilteredMarkets[0]!.maturityDate,
          Type: type,
        },
      });

      suggestions = {
        labelDescription: "Token class selection",
        textDescription: "Token class: Stable, ETH, BTC",
        content: [
          {
            label: "Stable yield",
            text: "Stable token class",
          },
          {
            label: "ETH yield",
            text: "ETH token class",
          },
          {
            label: "BTC yield",
            text: "BTC token class",
          },
        ],
      };
    } else if (!maturityDays) {
      intentContext = generateIntentContextSection({
        intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
        status: "Maturity days selection needed",
        userAddress,
        chainId,
        parameters: {
          From: tokenIn,
          Amount: amountIn,
          TokenClass: tokenClass ?? pendleFilteredMarkets[0]!.underlyingType,
          MaturityDays: maturityDays ?? pendleFilteredMarkets[0]!.maturityDate,
          Type: type,
        },
      });

      suggestions = {
        labelDescription: "Maturity days selection",
        textDescription: "Maturity days: <=30, 30-90, >90",
        content: [
          {
            label: "<=30 days",
            text: "Up to 30 days",
          },
          {
            label: "30-90 days",
            text: "30 to 90 days",
          },
          {
            label: ">90 days",
            text: "More than 90 days",
          },
        ],
      };
    } else {
      intentContext = generateIntentContextSection({
        intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
        status: "PT token selection needed",
        userAddress,
        chainId,
        parameters: {
          From: tokenIn,
          Amount: amountIn,
          TokenClass: tokenClass ?? pendleFilteredMarkets[0]!.underlyingType,
          MaturityDays: maturityDays ?? pendleFilteredMarkets[0]!.maturityDate,
          Type: type,
        },
      });

      suggestions = {
        labelDescription: "Use EXACT label format",
        textDescription: "Use EXACT text format",
        content: pendleFilteredMarkets.slice(0, 5).map((market) => ({
          label: `PT-${market.underlyingAssetName}-${market.maturityDate.split("T")[0]} (APY: ${formatDecimalToPercentage(market.impliedApy)})`,
          text: `I want to select ${market.underlyingAssetName} (maturity: ${market.maturityDate.split("T")[0]})`,
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

Each suggestion should:
- Be natural and conversational
- Use EXACT labels and texts without modifications
`,
    });

    return `<task>Generate amount suggestions for Pendle strategy</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  if (!type) {
    const intentContext = generateIntentContextSection({
      intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
      status: "Operation type selection needed (buy/sell/deposit/withdraw)",
      userAddress,
      chainId,
      parameters: {
        From: tokenIn,
        Amount: amountIn,
        TokenClass: tokenClass ?? pendleFilteredMarkets[0]!.underlyingType,
        MaturityDays: maturityDays ?? pendleFilteredMarkets[0]!.maturityDate,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate natural, conversational suggestions for operation type selection.

LABEL FORMAT:
- "Buy zero coupon bond" - for buy operation
- "Sell zero coupon bond" - for sell operation
- "Deposit liquidity" - for deposit operation
- "Withdraw liquidity" - for withdraw operation

TEXT FORMAT:
- "Buy zero coupon bond" - for buy operation
- "Sell zero coupon bond" - for sell operation
- "Deposit liquidity" - for deposit operation
- "Withdraw liquidity" - for withdraw operation

Each suggestion should:
- Be natural and conversational
- Use EXACT labels and texts without modifications
- Lead to amount selection and next steps
`,
    });

    return `<task>Generate amount suggestions for Pendle strategy</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  if (pendleFilteredMarkets.length === 1 && !amountIn) {
    // Find the asset in wallet to suggest percentage-based amounts
    const walletAsset = walletAssets.find(
      (a) => a.symbol?.toLowerCase() === tokenIn!.toLowerCase()
    );

    const intentContext = generateIntentContextSection({
      intentType: `${INTENT_TYPE.SELECT_PENDLE_STRATEGY}`,
      status: "Amount selection needed",
      userAddress,
      chainId,
      parameters: {
        From: tokenIn,
        To: tokenOut ?? pendleFilteredMarkets[0]!.underlyingAssetName,
        TokenClass: tokenClass ?? pendleFilteredMarkets[0]!.underlyingType,
        MaturityDays: maturityDays ?? pendleFilteredMarkets[0]!.maturityDate,
        Type: type,
      },
    });

    // Calculate actual token amounts based on balance using universal helper
    const amounts = calculateAmountsFromBalance(
      walletAsset?.balance ?? 0n,
      walletAsset?.decimals ?? 18,
      walletAsset?.address
    );

    const { fullAmount, amount75, amount50, amount25 } = amounts;

    // Generate amount context for prompt
    const amountContext = generateAmountContext(tokenIn!, amounts);

    const gasNote = amounts.isNativeToken
      ? `\nIMPORTANT: ${tokenIn} is native token - suggest max 95% to reserve gas for transaction.`
      : "";

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-4 natural, conversational suggestions for amount selection.

CRITICAL: The token symbol is "${tokenIn}" - use ONLY this exact symbol, nothing else.
${amounts.hasBalance ? `User has ${fullAmount} ${tokenIn} available in wallet${amounts.isNativeToken ? " (95% max to reserve gas)" : ""}.` : "No balance available."}${gasNote}

LABEL FORMAT (use specific amounts, NOT generic labels):
${
  amounts.hasBalance
    ? `- "Full balance" - for ${amounts.isNativeToken ? "95%" : "all"} ${tokenIn}
- "25% of balance" - for 25% of ${tokenIn}
- "75% of balance" - for 75% of ${tokenIn}
- "50% of balance" - for 50% of ${tokenIn}
- "Partial amount" - for a smaller specific amount`
    : `- Use descriptive labels with actual amounts when possible`
}

TEXT FORMAT (use "${tokenIn}" exactly as shown and ACTUAL amounts):
${
  amounts.hasBalance
    ? `- "I want to buy ${fullAmount} ${tokenIn}" - full ${amounts.isNativeToken ? "(95%)" : ""} balance
- "Use ${amount25} ${tokenIn}" - 25% of balance
- "Use ${amount75} ${tokenIn}" - 75% of balance
- "Use ${amount50} ${tokenIn}" - 50% of balance
- "I want to use ${amount25} ${tokenIn}" - 25% of balance`
    : `- "I want to buy 100 ${tokenIn}" - specific amount
- "Use 50 ${tokenIn}" - specific amount
- "Use all my ${tokenIn}" - maximum amount`
}
- "What amount should I use?" - ask for guidance

Each suggestion should:
- Be natural and conversational
- Use ONLY the token symbol "${tokenIn}" (no extra characters or variations)
- Provide specific amounts based on balance when available${amounts.isNativeToken ? "\n- Reserve 5% for gas if native token" : ""}
- Use EXACT labels and texts without modifications
- Lead to confirmation step`,
    });

    return `<task>Generate amount suggestions for Pendle strategy</task>
${intentContext}
<userWallet>
${amountContext || "User has no supported tokens in wallet"}
</userWallet>
<conversation>
${conversation}
</conversation>
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

CRITICAL: All suggestions MUST include the word "buy PT" to clearly indicate intent to buy PT token.

SUGGESTION PRIORITIES:
1. Select by PT token (specific tokens)
2. Ask about PT token recommendations
3. Inquire about PT token types (Stable, ETH, BTC)

SUGGESTION FORMATS (must include "buy PT"):
- "Buy PT [Token Name]" - by specific token
- "What PT tokens do you recommend?" - ask for guidance
- "Tell me about PT token options" - learn more

Each suggestion should:
- Be natural and conversational
- **MUST include "buy PT" in the text**
- Reference actual available PT tokens
- Lead to PT token selection and next steps
- Use EXACT labels and texts without modifications`,
  });

  return `<task>Generate PT token selection suggestions for Pendle strategy</task>
${intentContext}
<supportedTokens>
${ptTokensList || "No PT tokens available"}
</supportedTokens>
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
}
