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

FORMATTING:
- Use natural language: "Withdraw from [Strategy Name]"
- Include context when helpful: "Withdraw from [Strategy] ($XXX available)"
- For pending withdrawals: "Check my pending withdrawals" or "Claim ready withdrawals"

Each suggestion should:
- Be conversational and clear
- Reference actual strategy names when possible
- Indicate if position has pending withdrawal`,
    });

    return `<task>Generate position selection suggestions for withdrawal - user hasn't specified which strategy</task>
${intentContext}
<availablePositions>
${positions
  .map((pos) => {
    const strategy = strategies.find((s) => s.id === pos.strategyId);
    const strategyName = strategy?.name || `Strategy ${pos.strategyId}`;
    const hasPending = positionsWithPendingMap.has(pos.strategyId);
    return `${strategyName} (ID: ${pos.strategyId}): ${pos.balance} tokens ($${pos.balanceUsd.toFixed(2)}) ${hasPending ? "[Has pending withdrawal]" : "[Available]"}`;
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
${generateOutputFormat()}`;
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

    const instructions = generateCommonInstructions({
      suggestionType: "next-step",
      specificInstructions: `Generate 4-5 suggestions for withdrawal amounts:

STANDARD OPTIONS (always include):
1. "Withdraw all from [Strategy]" - withdraw 100%
2. "Withdraw 75% from [Strategy]" - withdraw 75%
3. "Withdraw 50% from [Strategy]" - withdraw 50%
4. "Withdraw 25% from [Strategy]" - withdraw 25%

OPTIONAL:
5. "Let me specify a custom amount" - for precise control

Each suggestion should:
- Be natural and conversational
- Reference the strategy name
- Use percentage-based language
- Lead to confirmation next`,
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
