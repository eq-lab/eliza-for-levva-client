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

    // Calculate actual token amounts based on balance
    const amounts = [1, 0.75, 0.5, 0.25];
    const fullAmount = position.balance;
    const calculatedAmounts = amounts.map(
      (pct) => Math.floor(fullAmount * pct * 100) / 100
    );
    const [, amount75, amount50, amount25] = calculatedAmounts;

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 4 suggestions for withdrawal amounts using ACTUAL token amounts:

IMPORTANT: Use real token amounts, NOT percentages in the text field.

Available balance: ${fullAmount} tokens ($${position.balanceUsd.toFixed(2)})

LABEL FORMAT:
- "Withdraw all from [Strategy Name]"
- "Withdraw 75% from [Strategy Name]"
- "Withdraw 50% from [Strategy Name]"
- "Withdraw 25% from [Strategy Name]"

TEXT FORMAT (what USER would type):
- Use actual calculated amounts based on balance
- Format: "Withdraw [amount] tokens from [Strategy Name]"
- Examples:
  • "Withdraw ${fullAmount} tokens from ${strategyName}"
  • "Withdraw ${amount75} tokens from ${strategyName}"
  • "Withdraw ${amount50} tokens from ${strategyName}"
  • "Withdraw ${amount25} tokens from ${strategyName}"

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

    const intentContext = generateIntentContextSection({
      intentType: "WITHDRAW",
      status: "All parameters set (confirmation handled in UI)",
      userAddress,
      chainId,
      parameters: {
        Strategy: `${strategyName} (ID: ${returnData.strategyId})`,
        Amount: amountDisplay,
        Step: withdrawalStep || "request",
      },
    });

    const instructions = generateCommonInstructions({
      suggestionType: "missing-info",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for editing or cancelling:

IMPORTANT: DO NOT suggest confirmation - that is handled by the UI.
Only provide suggestions for EDITING parameters or CANCELLING.

SUGGESTION PRIORITIES:
1. Edit amount
2. Change to different position/strategy
3. Cancel withdrawal

SUGGESTION FORMATS:
- "Actually, withdraw 50% instead" - edit amount
- "Withdraw from a different strategy" - change strategy
- "Cancel this withdrawal" - cancel

Each suggestion should:
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
