/**
 * Deposit intent suggestions with progressive disclosure
 *
 * @version 2.0.0
 * @lastModified 2025-01-XX
 * @changes v2.0.0: Refactored to use helper functions from src/prompts/helpers
 * @changes v1.0.0: Initial implementation with progressive disclosure
 */

import type { IntentContext } from "../../services/intent-manager";
import { generateIntentManagementSection } from "./intent-management";
import {
  generateIntentContextSection,
  generateOutputFormat,
  generateCommonInstructions,
} from "../helpers";

export interface DepositIntentSuggestionParams {
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
  returnData: {
    strategyId?: number;
    strategyName?: string;
    strategyRisk?: string;
    tokenSymbol?: string;
    tokenAddress?: string;
    amount?: string;
    leverage?: number;
    [key: string]: any;
  };
  positions: Array<{
    strategyId: number;
    balance: number;
    balanceUsd: number;
  }>;
  strategies: Array<{
    id: number;
    name: string;
    risk: string;
    type: "vault" | "pool";
    vaultUnderlyingToken?: string;
  }>;
  walletAssets: Array<{
    token: string;
    amount: bigint;
    value: bigint;
  }>;
  tokenMap: Map<
    `${number}:0x${string}`,
    | {
        symbol: string;
        address: string;
        decimals: number;
        name: string;
        chainId: number;
      }
    | undefined
  >;
}

/**
 * Generate intent-aware suggestions for DEPOSIT intent with progressive disclosure
 *
 * Progressive flow:
 * 1. No strategyId/strategyRisk -> Suggest strategies
 * 2. Strategy selected, no token -> Suggest tokens (vault vs pool logic)
 * 3. Strategy + token selected, no amount -> Suggest amounts
 * 4. Strategy + token + amount, pool needs leverage -> Suggest leverage
 * 5. All parameters set -> Suggest confirmation
 */
export function generateDepositIntentSuggestionsPrompt(
  params: DepositIntentSuggestionParams
): string {
  const {
    returnData,
    conversation,
    userAddress,
    chainId,
    positions,
    strategies,
    walletAssets,
    tokenMap: componentTokenMap,
  } = params;

  // Helper to get token from map by address
  const getToken = (address: string) => {
    return componentTokenMap.get(
      `${chainId}:${address}` as `${number}:0x${string}`
    );
  };

  const { strategyId, strategyName, tokenSymbol, amount, leverage } =
    returnData;

  // Find the selected strategy if ID is present
  const selectedStrategy = strategyId
    ? strategies.find((s) => s.id === strategyId)
    : undefined;

  const isPool = selectedStrategy?.type === "pool";
  const isVault = selectedStrategy?.type === "vault";

  // Case 1: All parameters present (including leverage for pools) - only show edit/cancel
  // Confirmation is handled in UI, suggestions are only for editing
  if (strategyId && tokenSymbol && amount && (!isPool || leverage)) {
    const strategyDisplay = strategyName || `Strategy #${strategyId}`;

    const intentContext = generateIntentContextSection({
      intentType: "DEPOSIT",
      status: "All parameters set (confirmation handled in UI)",
      userAddress,
      chainId,
      parameters: {
        Strategy: strategyDisplay,
        Token: tokenSymbol,
        Amount: amount,
        ...(isPool && leverage ? { Leverage: `${leverage}x` } : {}),
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "missing-info",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for editing or cancelling:

IMPORTANT: DO NOT suggest confirmation - that is handled by the UI.
Only provide suggestions for EDITING parameters or CANCELLING.

SUGGESTION PRIORITIES:
1. Edit amount
2. Edit leverage (pools only)
3. Change strategy
4. Cancel deposit

SUGGESTION FORMATS:
- "Actually, change the amount to [X]" - edit amount
- "Let me use [Y]x leverage instead" - edit leverage (pools)
- "Change to a different strategy" - change strategy
- "Cancel this deposit" - cancel

Each suggestion should:
- Be natural and conversational
- Focus on parameter modification or cancellation
- NOT include confirmation suggestions`,
    });

    return `<task>Generate edit/cancel suggestions for deposit - all parameters set</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // Case 2: Pool strategy needs leverage (strategy + token + amount set, but no leverage)
  if (isPool && strategyId && tokenSymbol && amount && !leverage) {
    const intentContext = generateIntentContextSection({
      intentType: "DEPOSIT",
      status: "Leverage selection needed",
      userAddress,
      chainId,
      parameters: {
        Strategy: `${strategyName || `Strategy #${strategyId}`} (Pool)`,
        Token: tokenSymbol,
        Amount: amount,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for leverage selection:

LEVERAGE OPTIONS (typically 1x-5x for pools):
- 1x (no leverage) - safest, lower returns
- 2x - moderate leverage
- 3x - higher leverage, higher risk/reward
- 5x - maximum leverage, highest risk/reward

SUGGESTION FORMATS:
- "Use 2x leverage" - specific leverage amount
- "I want maximum leverage" - highest available
- "No leverage please" - 1x (safest)
- "What leverage do you recommend?" - ask for guidance

Each suggestion should:
- Be natural and conversational
- Clearly specify leverage preference
- Consider risk tolerance`,
    });

    return `<task>Generate leverage selection suggestions for pool deposit</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // Case 3: Strategy + token selected, need amount
  if ((strategyId || strategyName) && tokenSymbol && !amount) {
    const strategyDisplay = strategyName || `Strategy #${strategyId}`;

    // Find the token in wallet to suggest percentage-based amounts
    const walletAsset = walletAssets.find((a) => {
      const token = getToken(a.token);
      return token && token.symbol.toLowerCase() === tokenSymbol.toLowerCase();
    });

    let amountContext = "";
    if (walletAsset) {
      const token = getToken(walletAsset.token);
      amountContext = token
        ? `\nUser has ${token.symbol} available in wallet.`
        : "";
    }

    const intentContext = generateIntentContextSection({
      intentType: "DEPOSIT",
      status: "Amount selection needed",
      userAddress,
      chainId,
      parameters: {
        Strategy: strategyDisplay,
        Token: tokenSymbol,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for deposit amount:

SUGGESTION PRIORITIES:
1. Specific amounts (e.g., "100 ${tokenSymbol}", "0.5 ${tokenSymbol}")
2. Percentage-based amounts (e.g., "50% of my ${tokenSymbol}", "all my ${tokenSymbol}")
3. Round numbers that make sense for the token
4. Ask about recommended amounts

SUGGESTION FORMATS:
- "Deposit 100 ${tokenSymbol}" - specific amount
- "I want to deposit 0.5 ${tokenSymbol}" - specific amount
- "Deposit 25% of my ${tokenSymbol}" - percentage-based
- "Invest all my ${tokenSymbol}" - maximum amount
- "What amount do you recommend?" - ask for guidance

Each suggestion should:
- Be natural and conversational
- Reference the actual token symbol
- Provide a variety of amount options
${walletAsset ? "- Consider the user's available balance" : ""}`,
    });

    return `<task>Generate amount suggestions for deposit</task>
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

  // Case 4: Strategy selected, need token (vault vs pool logic)
  if ((strategyId || strategyName) && !tokenSymbol) {
    const strategyDisplay = strategyName || `Strategy #${strategyId}`;

    // For vaults, token is determined by strategy
    if (isVault && selectedStrategy && selectedStrategy.vaultUnderlyingToken) {
      const vaultToken = getToken(selectedStrategy.vaultUnderlyingToken);
      const tokenSym =
        vaultToken?.symbol || selectedStrategy.vaultUnderlyingToken;

      const intentContext = generateIntentContextSection({
        intentType: "DEPOSIT",
        status: "Token confirmation",
        userAddress,
        chainId,
        parameters: {
          Strategy: `${strategyDisplay} (Vault)`,
          Token: `${tokenSym} (vault-specific)`,
        },
      });

      const instructions = generateCommonInstructions({
        suggestionType: "next-step",
        specificInstructions: `Vault strategies accept only their specific token (${tokenSym}).

Generate 3-5 natural, conversational suggestions:

SUGGESTION PRIORITIES:
1. Confirm deposit with vault token
2. Ask about the token requirement
3. Check if user has the token

SUGGESTION FORMATS:
- "Deposit ${tokenSym} into this vault" - proceed
- "I want to deposit ${tokenSym}" - confirm
- "Do I need ${tokenSym} for this?" - clarification
- "How much ${tokenSym} should I deposit?" - next step

Each suggestion should:
- Reference the vault's specific token
- Move conversation toward amount selection`,
      });

      return `<task>Generate token confirmation suggestions for vault deposit</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
    }

    // For pools, user can choose any token they have
    const walletTokens = walletAssets
      .filter((a) => a.amount > 0n)
      .map((a) => {
        const token = getToken(a.token);
        return token?.symbol || a.token.slice(0, 8);
      })
      .slice(0, 5);

    let walletContext = "";
    if (walletTokens.length > 0) {
      walletContext = `\nUser's wallet tokens: ${walletTokens.join(", ")}`;
    }

    const intentContext = generateIntentContextSection({
      intentType: "DEPOSIT",
      status: "Token selection needed",
      userAddress,
      chainId,
      parameters: {
        Strategy: `${strategyDisplay} (Pool)`,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Pool strategies accept multiple tokens. User can deposit any token they have.

Generate 3-5 natural, conversational suggestions:

SUGGESTION PRIORITIES:
1. Tokens from user's wallet (if known)
2. Common DeFi tokens (USDC, ETH, WETH, DAI)
3. Ask what tokens are accepted

SUGGESTION FORMATS:
${walletTokens.length > 0 ? `- "Deposit ${walletTokens[0]}" - from wallet` : ""}
- "I want to deposit USDC" - specific token
- "Can I deposit ETH?" - inquiry
- "What tokens can I use?" - clarification

Each suggestion should:
- Be natural and conversational
- Reference actual tokens when possible
- Lead to amount selection next`,
    });

    return `<task>Generate token selection suggestions for pool deposit</task>
${intentContext}
<userWallet>
${walletContext || "Wallet assets unknown"}
</userWallet>
<conversation>
${conversation}
</conversation>
${instructions}
${generateIntentManagementSection(
  "DEPOSIT",
  true,
  `If user doesn't have the required token for deposit:
- Suggest SWAP intent to convert tokens (e.g., "I need to swap ETH to USDC first")
- Suggest checking wallet balance (e.g., "Show me my wallet balance")

If user has all needed tokens:
- Focus on deposit flow suggestions
- No child intents needed`
)}
${generateOutputFormat()}`;
  }

  // Case 5: No strategy selected - suggest strategies
  const availableRisks = [...new Set(strategies.map((s) => s.risk))];

  // Group strategies by type
  const vaultStrategies = strategies.filter((s) => s.type === "vault");
  const poolStrategies = strategies.filter((s) => s.type === "pool");

  // Get top strategies by type
  const topVaults = vaultStrategies.slice(0, 3);
  const topPools = poolStrategies.slice(0, 3);

  let strategiesList = "";
  if (topVaults.length > 0) {
    strategiesList +=
      "Vaults:\n" + topVaults.map((s) => `- ${s.name} (${s.risk})`).join("\n");
  }
  if (topPools.length > 0) {
    strategiesList +=
      "\n\nPools:\n" +
      topPools.map((s) => `- ${s.name} (${s.risk})`).join("\n");
  }

  const intentContext = generateIntentContextSection({
    intentType: "DEPOSIT",
    status: "Strategy selection needed",
    userAddress,
    chainId,
    parameters: {},
  });

  const instructions = generateCommonInstructions({
    suggestionType: "next-step",
    specificInstructions: `Generate 3-5 natural, conversational suggestions for strategy selection:

SUGGESTION PRIORITIES:
1. Select by risk level ("ultra-safe", "safe", "brave")
2. Select by strategy name (specific strategies)
3. Ask about strategy recommendations
4. Inquire about strategy types (vault vs pool)

SUGGESTION FORMATS:
- "Show me ultra-safe strategies" - by risk level
- "I want a brave strategy" - by risk preference
- "Invest in [Strategy Name]" - by specific strategy
- "What strategies do you recommend?" - ask for guidance
- "Tell me about vaults vs pools" - learn more

Each suggestion should:
- Be natural and conversational
- Reference actual available strategies or risk levels
- Lead to strategy selection and next steps`,
  });

  return `<task>Generate strategy selection suggestions for deposit</task>
${intentContext}
<availableStrategies>
${strategiesList || "No strategies available"}

Available risk levels: ${availableRisks.join(", ")}
</availableStrategies>
<userPositions>
${positions.length > 0 ? positions.map((p) => `Strategy #${p.strategyId}: $${p.balanceUsd.toFixed(2)}`).join("\n") : "No current positions"}
</userPositions>
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
}
