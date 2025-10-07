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

    const intentContext = generateIntentContextSection({
      intentType: "SWAP",
      status: "Ready for confirmation",
      userAddress,
      chainId,
      parameters: {
        From: fromSymbol,
        To: toSymbol,
        Amount: amount,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "confirmation",
      specificInstructions: `Generate 3-4 natural, conversational suggestions for swap confirmation:

SUGGESTION PRIORITIES:
1. Confirm and proceed with the swap
2. Retry if transaction failed
3. Adjust the amount
4. Cancel and try different parameters

SUGGESTION FORMATS:
- "Yes, please proceed with the swap" - confirmation
- "Let me retry this swap" - retry after failure
- "Swap ${amount} ${fromSymbol} to ${toSymbol}" - explicit confirmation
- "Actually, let me swap a different amount" - modify amount
- "Cancel and swap something else" - restart

Each suggestion should:
- Be natural and conversational
- Clearly indicate confirmation or modification intent
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

    let amountContext = "";
    if (walletAsset) {
      amountContext = `\nUser has ${walletAsset.symbol} available in wallet.`;
    }

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

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-4 natural, conversational suggestions for swap amount:

SUGGESTION PRIORITIES:
1. Specific amounts (e.g., "100 ${fromSymbol}", "0.1 ${fromSymbol}")
2. Percentage-based amounts (e.g., "50% of my ${fromSymbol}", "all my ${fromSymbol}")
3. Round numbers that make sense for the token
4. Ask about recommended amounts

SUGGESTION FORMATS:
- "I want to swap 100 ${fromSymbol}" - specific amount
- "Let me swap 0.5 ${fromSymbol}" - specific amount
- "Swap 25% of my ${fromSymbol}" - percentage-based
- "I'd like to swap all my ${fromSymbol}" - maximum amount
- "What amount should I swap?" - ask for guidance

Each suggestion should:
- Be natural and conversational
- Reference the actual from-token symbol
- Provide a variety of amount options
${walletAsset ? "- Consider the user's available balance" : ""}`,
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
  const walletTokensCase5 = walletAssets.filter((a) => a.amount > 0n).slice(0, 5);

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

SUGGESTION PRIORITIES:
1. Popular swap pairs (ETH/USDC, WETH/DAI, etc.)
2. Tokens from user's wallet (if known)
3. General swap inquiries

SUGGESTION FORMATS:
- "Swap ETH to USDC" - popular pair
- "Convert WETH to DAI" - popular pair
${walletTokensCase5.length > 0 ? `- "Swap my ${walletTokensCase5[0].symbol}" - from wallet` : ""}
- "What tokens can I swap?" - inquiry
- "Show me available swap pairs" - general inquiry

Each suggestion should:
- Be natural and conversational
- Suggest complete pairs when possible
- Reference wallet tokens when available
- Lead to token selection`,
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
