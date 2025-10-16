/**
 * Swap intent suggestions with progressive disclosure
 *
 * @version 2.0.0
 * @lastModified 2025-01-XX
 * @changes v2.0.0: Refactored to use helper functions from src/prompts/helpers
 * @changes v1.0.0: Initial implementation with progressive token/amount selection
 */

import type { IntentContext } from "../../services/intent-manager";
import {
  generateIntentContextSection,
  generateOutputFormat,
  generateCommonInstructions,
} from "../helpers";
import {
  calculateAmountsFromBalance,
  generateAmountContext,
} from "../helpers/amount-suggestions";

export interface SwapIntentSuggestionParams {
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
  returnData: {
    fromToken?: string;
    fromTokenSymbol?: string;
    toToken?: string;
    toTokenSymbol?: string;
    amount?: string;
    [key: string]: any;
  };
  walletAssets: Array<{
    token: string;
    symbol: string;
    amount: bigint;
    value: bigint;
    decimals?: number;
  }>;
  availableTokens: Array<{
    address: string;
    symbol: string;
  }>;
}

/**
 * Generate intent-aware suggestions for SWAP intent with progressive disclosure
 *
 * Progressive flow:
 * 1. No fromToken -> Suggest tokens from wallet
 * 2. fromToken set, no toToken -> Suggest destination tokens
 * 3. Both tokens set, no amount -> Suggest amounts
 * 4. All parameters set -> Suggest confirmation/retry
 */
export function generateSwapIntentSuggestionsPrompt(
  params: SwapIntentSuggestionParams
): string {
  const {
    returnData,
    walletAssets,
    availableTokens,
    conversation,
    userAddress,
    chainId,
  } = params;

  const { fromToken, fromTokenSymbol, toToken, toTokenSymbol, amount } =
    returnData;

  // Case 1: All parameters present - suggest confirmation/retry
  if (fromToken && toToken && amount) {
    const fromSymbol = fromTokenSymbol || fromToken.slice(0, 8);
    const toSymbol = toTokenSymbol || toToken.slice(0, 8);

    // Get wallet asset for balance-aware amount suggestions
    const walletAsset = walletAssets.find(
      (a) => a.token.toLowerCase() === fromToken.toLowerCase()
    );

    const amounts = calculateAmountsFromBalance(
      walletAsset?.amount ?? 0n,
      walletAsset?.decimals ?? 18,
      walletAsset?.token
    );

    const intentContext = generateIntentContextSection({
      intentType: "SWAP",
      status: "Ready for confirmation",
      userAddress,
      chainId,
      parameters: {
        From: fromSymbol,
        To: toSymbol,
        Amount: amount,
        ...(amounts.hasBalance
          ? { "Available Balance": `${amounts.fullAmount} ${fromSymbol}` }
          : {}),
      },
    });

    const amountContext = amounts.hasBalance
      ? `\nFor amount modifications, user has ${amounts.fullAmount} ${fromSymbol} available. Suggest specific amounts: ${amounts.amount50} ${fromSymbol}, ${amounts.amount75} ${fromSymbol}.`
      : "";

    // Build label examples
    const labelExamples = [
      `- "Confirm swap" - for confirmation`,
      `- "Retry swap" - for retry`,
    ];
    if (amounts.hasBalance) {
      labelExamples.push(
        `- "Swap ${amounts.amount50} ${fromSymbol}" - for 50% amount`
      );
    } else {
      labelExamples.push(`- "Different amount" - for amount change`);
    }
    labelExamples.push(`- "Cancel swap" - for cancellation`);

    // Build text examples
    const textExamples = [
      `- "Yes, please proceed with the swap" - confirmation`,
      `- "Let me retry this swap" - retry after failure`,
      `- "Swap ${amount} ${fromSymbol} to ${toSymbol}" - explicit confirmation`,
    ];
    if (amounts.hasBalance) {
      textExamples.push(
        `- "Actually, swap ${amounts.amount50} ${fromSymbol} instead" - modify with specific amount`
      );
    } else {
      textExamples.push(
        `- "Actually, let me swap a different amount" - modify amount`
      );
    }
    textExamples.push(`- "Cancel and swap something else" - restart`);

    const instructions = generateCommonInstructions({
      suggestionType: "confirmation",
      specificInstructions: `Generate 3-4 natural, conversational suggestions for swap confirmation:
${amountContext}

SUGGESTION PRIORITIES:
1. Confirm and proceed with the swap
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

    return `<task>Generate confirmation suggestions for swap - all parameters provided</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // Case 2: Both tokens selected, need amount
  if (fromToken && toToken && !amount) {
    const fromSymbol = fromTokenSymbol || fromToken.slice(0, 8);
    const toSymbol = toTokenSymbol || toToken.slice(0, 8);

    // Find the asset in wallet to suggest percentage-based amounts
    const walletAsset = walletAssets.find(
      (a) => a.token.toLowerCase() === fromToken.toLowerCase()
    );

    const intentContext = generateIntentContextSection({
      intentType: "SWAP",
      status: "Amount selection needed",
      userAddress,
      chainId,
      parameters: {
        From: fromSymbol,
        To: toSymbol,
      },
    });

    // Calculate actual token amounts based on balance using universal helper
    const amounts = calculateAmountsFromBalance(
      walletAsset?.amount ?? 0n,
      walletAsset?.decimals ?? 18,
      walletAsset?.token
    );

    const { fullAmount, amount75, amount50, amount25 } = amounts;

    // Generate amount context for prompt
    const amountContext = generateAmountContext(fromSymbol, amounts);

    const gasNote = amounts.isNativeToken
      ? `\nIMPORTANT: ${fromSymbol} is native token - suggest max 95% to reserve gas for transaction.`
      : "";

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-4 natural, conversational suggestions for swap amount.

CRITICAL: The token symbol is "${fromSymbol}" - use ONLY this exact symbol, nothing else.
${amounts.hasBalance ? `User has ${fullAmount} ${fromSymbol} available in wallet${amounts.isNativeToken ? " (95% max to reserve gas)" : ""}.` : "No balance available."}${gasNote}

LABEL FORMAT (use specific amounts, NOT generic labels):
${
  amounts.hasBalance
    ? `- "Full balance" - for swapping ${amounts.isNativeToken ? "95%" : "all"} ${fromSymbol}
- "75% of balance" - for swapping 75% of ${fromSymbol}
- "50% of balance" - for swapping 50% of ${fromSymbol}
- "Partial amount" - for a smaller specific amount`
    : `- Use descriptive labels with actual amounts when possible`
}

TEXT FORMAT (use "${fromSymbol}" exactly as shown and ACTUAL amounts):
${
  amounts.hasBalance
    ? `- "I want to swap ${fullAmount} ${fromSymbol}" - full ${amounts.isNativeToken ? "(95%)" : ""} balance
- "Swap ${amount75} ${fromSymbol}" - 75% of balance
- "Swap ${amount50} ${fromSymbol}" - 50% of balance
- "I want to swap ${amount25} ${fromSymbol}" - 25% of balance`
    : `- "I want to swap 100 ${fromSymbol}" - specific amount
- "Swap 50 ${fromSymbol}" - specific amount
- "Swap all my ${fromSymbol}" - maximum amount`
}
- "What amount should I swap?" - ask for guidance

Each suggestion should:
- Be natural and conversational
- Use ONLY the token symbol "${fromSymbol}" (no extra characters or variations)
- Provide specific amounts based on balance when available${amounts.isNativeToken ? "\n- Reserve 5% for gas if native token" : ""}
- Lead to confirmation step`,
    });

    return `<task>Generate amount suggestions for swap</task>
${intentContext}
<userWallet>
${amountContext || "Wallet assets unknown"}
</userWallet>
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // Case 3: Only fromToken selected, need toToken
  if (fromToken && !toToken) {
    const fromSymbol = fromTokenSymbol || fromToken.slice(0, 8);

    // Suggest popular/common destination tokens
    const popularTokens = ["USDC", "USDT", "DAI", "WETH", "ETH"];
    const availablePopular = availableTokens
      .filter((t) => popularTokens.includes(t.symbol.toUpperCase()))
      .slice(0, 5);

    const tokenList =
      availablePopular.length > 0
        ? availablePopular.map((t) => t.symbol).join(", ")
        : "USDC, ETH, WETH, DAI";

    const intentContext = generateIntentContextSection({
      intentType: "SWAP",
      status: "Destination token selection needed",
      userAddress,
      chainId,
      parameters: {
        From: fromSymbol,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for destination token:

SUGGESTION PRIORITIES:
1. Popular stablecoins (USDC, USDT, DAI)
2. ETH/WETH
3. Ask about available tokens

SUGGESTION FORMATS:
- "Swap ${fromSymbol} to USDC" - to stablecoin
- "Convert ${fromSymbol} to ETH" - to native token
- "Exchange ${fromSymbol} for WETH" - to wrapped token
- "Trade ${fromSymbol} for DAI" - to another stablecoin
- "What tokens can I swap ${fromSymbol} to?" - inquiry

Each suggestion should:
- Be natural and conversational
- Reference actual from-token
- Suggest commonly available destination tokens
- Lead to amount selection next`,
    });

    return `<task>Generate destination token suggestions for swap</task>
${intentContext}
<availableTokens>
Popular tokens: ${tokenList}
</availableTokens>
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // Case 4: Only toToken selected, need fromToken
  if (!fromToken && toToken) {
    const toSymbol = toTokenSymbol || toToken.slice(0, 8);

    // Suggest tokens from user's wallet
    const walletTokens = walletAssets.filter((a) => a.amount > 0n).slice(0, 5);

    let walletContext = "";
    if (walletTokens.length > 0) {
      const symbols = walletTokens.map((a) => a.symbol).join(", ");
      walletContext = `\nUser's wallet tokens: ${symbols}`;
    }

    const intentContext = generateIntentContextSection({
      intentType: "SWAP",
      status: "Source token selection needed",
      userAddress,
      chainId,
      parameters: {
        To: toSymbol,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for source token:

SUGGESTION PRIORITIES:
1. Tokens from user's wallet (if known)
2. Popular source tokens (ETH, USDC, WETH)
3. Ask about available tokens

SUGGESTION FORMATS:
${walletTokens.length > 0 ? `- "Swap ${walletTokens[0].symbol} to ${toSymbol}" - from wallet` : ""}
- "Swap ETH to ${toSymbol}" - from native token
- "Convert USDC to ${toSymbol}" - from stablecoin
- "Exchange WETH for ${toSymbol}" - from wrapped token
- "What can I swap to ${toSymbol}?" - inquiry

Each suggestion should:
- Be natural and conversational
- Reference tokens from user's wallet when possible
- Lead to amount selection next`,
    });

    return `<task>Generate source token suggestions for swap</task>
${intentContext}
<userWallet>
${walletContext || "Wallet assets unknown"}
</userWallet>
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // Case 5: No tokens selected - suggest popular pairs or tokens from wallet
  const walletTokensCase5 = walletAssets
    .filter((a) => a.amount > 0n)
    .slice(0, 5);

  let walletContext = "";
  if (walletTokensCase5.length > 0) {
    const symbols = walletTokensCase5.map((a) => a.symbol).join(", ");
    walletContext = `\nUser's wallet tokens: ${symbols}`;
  }

  const intentContext = generateIntentContextSection({
    intentType: "SWAP",
    status: "Token pair selection needed",
    userAddress,
    chainId,
    parameters: {},
  });

  const instructions = generateCommonInstructions({
    suggestionType: "next-step",
    specificInstructions: `Generate 3-5 natural, conversational suggestions for token pair selection:

CRITICAL: Use EXACT token symbols without modifications or extra characters.
${walletTokensCase5.length > 0 ? `User wallet tokens: ${walletTokensCase5.map((t) => t.symbol).join(", ")}` : ""}

LABEL FORMAT (be specific, include actual token pairs):
- "ETH → USDC pair" - for ETH to USDC swap
- "WETH → DAI pair" - for WETH to DAI swap
- "Swap ${walletTokensCase5.length > 0 ? walletTokensCase5[0].symbol : "wallet token"}" - for wallet tokens
- "General swap inquiry" - for questions
- "Cancel swap" - for cancellation

TEXT FORMAT (user-facing, use EXACT symbols):
- "Swap ETH to USDC" - popular pair (label: "ETH → USDC pair")
- "Convert WETH to DAI" - popular pair (label: "WETH → DAI pair")
${walletTokensCase5.length > 0 ? `- "Swap my ${walletTokensCase5[0].symbol}" - from wallet (label: "Swap ${walletTokensCase5[0].symbol}")` : ""}
- "What tokens can I swap?" - inquiry (label: "General swap inquiry")
- "Show me available swap pairs" - general inquiry (label: "General swap inquiry")

Each suggestion should:
- Use EXACT token symbols as provided (no modifications like "LUSDCus")
- Have specific, descriptive labels that include the actual tokens
- Be natural and conversational in the text field
- Lead to next step in swap flow`,
  });

  return `<task>Generate token selection suggestions for swap - no tokens specified yet</task>
${intentContext}
<userWallet>
${walletContext || "Wallet assets unknown"}
</userWallet>
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
}
