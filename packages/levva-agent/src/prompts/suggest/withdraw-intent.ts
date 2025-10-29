/**
 * Withdrawal intent suggestions with progressive disclosure
 *
 * @version 2.0.0
 * @lastModified 2025-01-XX
 * @changes v2.0.0: Refactored to use helper functions from src/prompts/helpers
 * @changes v1.0.0: Initial implementation with request/claim flow
 */

import type { IntentContext } from "../../services/intent-manager";
import {
  generateIntentContextSection,
  generateOutputFormat,
  generateCommonInstructions,
} from "../helpers";
import { calculateAmountsFromBalance } from "../helpers/amount-suggestions";

export interface WithdrawIntentSuggestionParams {
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
  returnData: {
    strategyId?: number;
    amount?: string | number;
    withdrawalStep?: "request" | "claim";
    [key: string]: any;
  };
  positions: Array<{
    strategyId: number;
    balance: number;
    balanceUsd: number;
    tokenSymbol?: string;
    tokenDecimals?: number;
  }>;
  strategies: Array<{
    id: number;
    name: string;
    risk: string;
  }>;
  withdrawalRequests: Array<{
    strategyId: number;
    status: "PENDING" | "READY_TO_CLAIM";
  }>;
}

/**
 * Generate intent-aware suggestions for WITHDRAW intent with progressive disclosure
 *
 * Progressive flow:
 * 1. No strategy -> Suggest position selection
 * 2. Strategy selected, no amount -> Suggest amounts (25%, 50%, 75%, all)
 * 3. All parameters set -> Suggest edit/cancel (confirmation in UI)
 * 4. Claim step -> Suggest claiming finalized withdrawals
 */
export function generateWithdrawIntentSuggestionsPrompt(
  params: WithdrawIntentSuggestionParams
): string {
  const {
    returnData,
    conversation,
    userAddress,
    chainId,
    positions,
    strategies,
    withdrawalRequests,
  } = params;

  // Note: userAddress and chainId are used in prompt context sections below

  const hasStrategyId =
    returnData.strategyId !== undefined && returnData.strategyId !== null;
  const hasAmount =
    returnData.amount !== undefined && returnData.amount !== null;
  const withdrawalStep = returnData.withdrawalStep;

  // Check for pending withdrawals
  const pendingWithdrawals = withdrawalRequests.filter(
    (req) => req.status === "PENDING" || req.status === "READY_TO_CLAIM"
  );
  const hasPendingWithdrawals = pendingWithdrawals.length > 0;

  // CASE 1: No strategy selected yet - suggest position selection
  if (!hasStrategyId) {
    if (positions.length === 0) {
      return `<task>Generate empty suggestions since user has no positions to withdraw from</task>
<output>
{
  "suggestions": []
}
</output>`;
    }

    // Check which positions have pending withdrawals
    const positionsWithPendingMap = new Map(
      pendingWithdrawals.map((pw) => [pw.strategyId, true])
    );

    const intentContext = generateIntentContextSection({
      intentType: "WITHDRAW",
      status: "Position selection needed",
      userAddress,
      chainId,
      parameters: {
        Strategy: "Not selected",
        Amount: "N/A",
        Step: withdrawalStep || "request",
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 4 suggestions to help user select which position to withdraw from:

PRIORITIZATION:
1. If there are pending withdrawals, include a "Check withdrawal status" suggestion as first option
2. Show largest position by USD value
3. Show a medium-sized position (if 3+ positions available)
4. Show smallest position OR suggest custom position selection

LABEL FORMAT:
- Use strategy name with risk level (capitalize first letter)
- Format: "[Risk Level]([Strategy Name]) Strategy"
- Risk levels: brave, safe, ultra-safe, custom, optimal
- Examples:
  • "Brave(Maximised long-term growth) Strategy"
  • "Custom(Origin WETH Vault) Strategy"
  • "Safe(Safe yield) Strategy"
  • "Ultra-safe(Conservative returns) Strategy"

TEXT FORMAT (what USER would type):
- Simple, natural user message without dollar amounts
- Format: "Withdraw from [Strategy Name]" or "I want to withdraw from [Strategy Name]"
- Examples:
  ✅ "Withdraw from Origin WETH Vault"
  ✅ "I want to withdraw from Safe yield"
  ❌ "Withdraw from Safe yield ($6.86 available)" (Don't include amounts!)
  ❌ "Consider withdrawing from..." (Don't use agent language!)

For pending withdrawals:
- Label: "Check Withdrawal Status"
- Text: "Check my pending withdrawals" or "What's the status of my withdrawals?"

Each suggestion should:
- Have a clear, strategy-specific label
- Use natural user language in text (no dollar amounts!)
- Indicate pending status in label if applicable: "[Strategy Name] (Pending withdrawal)"`,
    });

    // Create example output for clarity
    const exampleOutput = `{
  "suggestions": [
    {
      "label": "Custom(Origin WETH Vault) Strategy",
      "text": "Withdraw from Origin WETH Vault"
    },
    {
      "label": "Safe(Safe yield) Strategy",
      "text": "I want to withdraw from Safe yield"
    },
    {
      "label": "Brave(Maximised long-term growth) Strategy",
      "text": "Withdraw from Maximised long-term growth"
    },
    {
      "label": "Cancel",
      "text": "Never mind"
    }
  ]
}`;

    return `<task>Generate position selection suggestions for withdrawal - user hasn't specified which strategy</task>
${intentContext}
<availablePositions>
${positions
  .map((pos) => {
    const strategy = strategies.find((s) => s.id === pos.strategyId);
    const strategyName = strategy?.name || `Strategy ${pos.strategyId}`;
    const riskLevel = strategy?.risk || "Unknown";
    const hasPending = positionsWithPendingMap.has(pos.strategyId);
    return `${strategyName} | Risk: ${riskLevel} | Balance: ${pos.balance} tokens ($${pos.balanceUsd.toFixed(2)}) ${hasPending ? "[Has pending withdrawal]" : "[Available for withdrawal]"}`;
  })
  .join("\n")}
</availablePositions>
<pendingWithdrawals>
${hasPendingWithdrawals ? `User has ${pendingWithdrawals.length} pending withdrawal(s)` : "No pending withdrawals"}
</pendingWithdrawals>
<conversation>
${conversation}
</conversation>
${instructions}
<output>
Generate suggestions in JSON format based on ACTUAL positions above.

EXAMPLE FORMAT (use actual data, not these examples):
${exampleOutput}

CRITICAL REMINDERS:
- Label: Use actual strategy names and risk levels from availablePositions
- Text: What the USER would type (no dollar amounts!)
</output>`;
  }

  // CASE 2: Strategy selected, need amount
  if (hasStrategyId && !hasAmount) {
    const strategy = strategies.find((s) => s.id === returnData.strategyId);
    const strategyName = strategy?.name || `Strategy ${returnData.strategyId}`;
    const position = positions.find(
      (p) => p.strategyId === returnData.strategyId
    );

    if (!position) {
      return `<task>Generate error message - selected strategy not found in positions</task>
<output>
{
  "suggestions": [
    {
      "label": "Error",
      "text": "That position was not found. Please select a different one."
    }
  ]
}
</output>`;
    }

    const intentContext = generateIntentContextSection({
      intentType: "WITHDRAW",
      status: "Amount selection needed",
      userAddress,
      chainId,
      parameters: {
        Strategy: `${strategyName} (ID: ${returnData.strategyId})`,
        Amount: "Not selected",
        "Available Balance": `${position.balance} tokens ($${position.balanceUsd.toFixed(2)})`,
        Step: withdrawalStep || "request",
      },
    });

    // Calculate actual token amounts based on balance using helper
    const tokenSymbol = position.tokenSymbol || "tokens";
    const tokenDecimals = position.tokenDecimals || 18;
    const amounts = calculateAmountsFromBalance(
      position.balance,
      tokenDecimals,
      undefined // Not native token (position balance)
    );

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 4 suggestions for withdrawal amounts using ACTUAL token amounts:

IMPORTANT: Use real token amounts, NOT percentages in the text field.

Available balance: ${amounts.fullAmount} ${tokenSymbol} ($${position.balanceUsd.toFixed(2)})
Token decimals: ${tokenDecimals}

Calculated amounts for suggestions:
- 100%: ${amounts.fullAmount} ${tokenSymbol}
- 75%: ${amounts.amount75} ${tokenSymbol}
- 50%: ${amounts.amount50} ${tokenSymbol}
- 25%: ${amounts.amount25} ${tokenSymbol}

LABEL FORMAT (can include percentages):
- "Withdraw all from ${strategyName}"
- "Withdraw 75% from ${strategyName}"
- "Withdraw 50% from ${strategyName}"
- "Withdraw 25% from ${strategyName}"

TEXT FORMAT (must use actual calculated amounts):
- Use the calculated amounts provided above
- Format: "Withdraw [amount] ${tokenSymbol} from ${strategyName}"
- Examples:
  • "Withdraw ${amounts.fullAmount} ${tokenSymbol} from ${strategyName}"
  • "Withdraw ${amounts.amount75} ${tokenSymbol} from ${strategyName}"
  • "Withdraw ${amounts.amount50} ${tokenSymbol} from ${strategyName}"
  • "Withdraw ${amounts.amount25} ${tokenSymbol} from ${strategyName}"

DO NOT include:
- "Specify a custom amount" suggestion (users can type custom amounts directly)
- Percentage signs in text field
- Dollar amounts in text field

Each suggestion should:
- Have a clear label with percentage indication
- Use actual token amounts in text field
- Be natural and conversational`,
    });

    return `<task>Generate amount suggestions for withdrawal - user has selected strategy but not amount</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // CASE 3: Both strategy and amount selected - only show edit/cancel
  // Confirmation is handled in UI, suggestions are only for editing
  if (hasStrategyId && hasAmount) {
    const strategy = strategies.find((s) => s.id === returnData.strategyId);
    const strategyName = strategy?.name || `Strategy ${returnData.strategyId}`;
    const amountDisplay =
      returnData.amount === "all" ? "ALL" : String(returnData.amount);

    // Get position balance for position-aware suggestions
    const position = positions.find(
      (p) => p.strategyId === returnData.strategyId
    );

    // Get token info from position or strategy
    const tokenSymbol =
      position?.tokenSymbol ||
      (strategy as any)?.vault?.underlyingToken?.symbol ||
      "tokens";
    const tokenDecimals =
      position?.tokenDecimals ||
      (strategy as any)?.vault?.underlyingToken?.decimals ||
      18;

    // Calculate alternative amounts based on position amount using helper
    const amounts = position
      ? calculateAmountsFromBalance(
          position.balance,
          tokenDecimals,
          undefined // Not native token (position balance)
        )
      : {
          fullAmount: "",
          amount75: "",
          amount50: "",
          amount25: "",
          isNativeToken: false,
          hasBalance: false,
        };

    // Get alternative strategies for suggestions
    const alternativeStrategies = positions
      .filter((p) => p.strategyId !== returnData.strategyId)
      .slice(0, 2)
      .map((p) => {
        const strat = strategies.find((s) => s.id === p.strategyId);
        return strat?.name || `Strategy ${p.strategyId}`;
      });

    const intentContext = generateIntentContextSection({
      intentType: "WITHDRAW",
      status: "All parameters set (confirmation handled in UI)",
      userAddress,
      chainId,
      parameters: {
        Strategy: `${strategyName} (ID: ${returnData.strategyId})`,
        Amount: amountDisplay,
        Step: withdrawalStep || "request",
        ...(position
          ? {
              "Position Amount": `${amounts.fullAmount} ${tokenSymbol} ($${position.balanceUsd.toFixed(2)})`,
            }
          : {}),
      },
    });

    const amountContext =
      position && amounts.hasBalance
        ? `\nUser has ${amounts.fullAmount} ${tokenSymbol} in this position. Suggest specific amounts: ${amounts.amount50} ${tokenSymbol}, ${amounts.amount75} ${tokenSymbol}, or ${amounts.fullAmount} ${tokenSymbol}.`
        : "";

    const strategyContext =
      alternativeStrategies.length > 0
        ? `\nAlternative positions: ${alternativeStrategies.join(", ")}`
        : "";

    // Build label format examples
    const labelExamples = [];
    if (position) {
      labelExamples.push(
        `- "Withdraw ${amount50} ${tokenSymbol}" - for 50% of position`,
        `- "Withdraw ${amount75} ${tokenSymbol}" - for 75% of position`,
        `- "Withdraw ${fullAmount} ${tokenSymbol}" - for full position`
      );
    } else {
      labelExamples.push(`- "Withdraw 50%" - for different amount`);
    }
    if (alternativeStrategies.length > 0) {
      labelExamples.push(
        `- "${alternativeStrategies[0]}" - for specific strategy change`
      );
    } else {
      labelExamples.push(`- "Different strategy" - for strategy change`);
    }
    labelExamples.push(`- "Cancel withdrawal" - for cancellation`);

    // Build text format examples
    const textExamples = [];
    if (position) {
      textExamples.push(
        `- "Actually, withdraw ${amount50} ${tokenSymbol} instead"`,
        `- "Let me withdraw ${amount75} ${tokenSymbol}"`,
        `- "Withdraw ${fullAmount} ${tokenSymbol} from ${strategyName}"`
      );
    } else {
      textExamples.push(`- "Actually, withdraw 50% instead"`);
    }
    if (alternativeStrategies.length > 0) {
      textExamples.push(`- "Withdraw from ${alternativeStrategies[0]}"`);
    } else {
      textExamples.push(`- "Withdraw from a different strategy"`);
    }
    textExamples.push(`- "Cancel this withdrawal"`);

    const instructions = generateCommonInstructions({
      suggestionType: "missing-info",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for editing or cancelling:

IMPORTANT: DO NOT suggest confirmation - that is handled by the UI.
Only provide suggestions for EDITING parameters or CANCELLING.
${amountContext}${strategyContext}

SUGGESTION PRIORITIES:
1. Edit amount with SPECIFIC amounts from position (in actual token like USDC, ETH)
2. Change to SPECIFIC alternative position/strategy
3. Cancel withdrawal

LABEL FORMAT (must be SPECIFIC):
${labelExamples.join("\n")}

TEXT FORMAT (use ACTUAL specific values):
${textExamples.join("\n")}

Each suggestion should:
- Use SPECIFIC amounts with ACTUAL token symbols (${tokenSymbol}) in BOTH label and text
- Be natural and conversational
- Focus on parameter modification or cancellation
- NOT include confirmation suggestions`,
    });

    return `<task>Generate edit/cancel suggestions for withdrawal - all parameters set</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // CASE 4: Withdrawal in claim step - suggest claiming or status check
  if (withdrawalStep === "claim") {
    const intentContext = generateIntentContextSection({
      intentType: "WITHDRAW",
      status: "Pending withdrawal ready to claim",
      userAddress,
      chainId,
      parameters: {
        Strategy: returnData.strategyId
          ? `ID ${returnData.strategyId}`
          : "Specified",
        Step: withdrawalStep,
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "confirmation",
      specificInstructions: `Generate suggestions for claiming finalized withdrawals:

PRIORITIES:
1. Claim the withdrawal (if ready)
2. Check withdrawal status
3. Cancel and start new withdrawal

Each suggestion should:
- Be action-oriented
- Clearly indicate claiming vs checking status
- Be conversational`,
      includeCancellation: true,
    });

    return `<task>Generate finalization suggestions for active withdrawal request</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
  }

  // Fallback: Generic withdrawal suggestions
  return `<task>Generate generic withdrawal suggestions</task>
<output>
{
  "suggestions": [
    {
      "label": "Start withdrawal",
      "text": "I want to withdraw from my positions"
    }
  ]
}
</output>`;
}
