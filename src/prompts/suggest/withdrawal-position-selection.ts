export interface WithdrawalPositionSelectionParams {
  conversation: string;
  decision: any;
  positions: Array<{
    strategyId: number;
    balance: number;
    balanceUsd: number;
    hasPendingWithdrawals: boolean;
  }>;
  strategies: Array<{
    id: number;
    name: string;
  }>;
}

export const withdrawalPositionSelectionPrompt = ({
  conversation,
  decision,
  positions,
  strategies,
}: WithdrawalPositionSelectionParams): string => {
  if (positions.length === 0) {
    return `<task>Generate empty suggestions since user has no positions to withdraw from</task>
<output>
{
  "suggestions": []
}
</output>`;
  }

  return `<task>Generate position selection suggestions for withdrawal when user hasn't specified which strategy</task>
<decision>
${JSON.stringify(decision)}
</decision>
<availablePositions>
${positions
  .map((pos) => {
    const strategy = strategies.find((s) => s.id === pos.strategyId);
    const strategyName = strategy?.name || `Strategy ${pos.strategyId}`;
    return `${strategyName} (ID: ${pos.strategyId}): ${pos.balance} tokens ($${pos.balanceUsd.toFixed(2)}) - ${pos.hasPendingWithdrawals ? "Has pending withdrawals" : "Available"}`;
  })
  .join("\n")}
</availablePositions>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4 suggestions to help user select which position to withdraw from:

1. Show the largest position by USD value
2. Show a medium-sized position 
3. Show the smallest position
4. Suggest checking withdrawal status if any positions have pending withdrawals

For each suggestion:
- Label should be concise: "Withdraw from [Strategy Name]" or "Check [Strategy Name] status"
- Text should be a natural message like "I want to withdraw from [Strategy Name]" or "Check my withdrawal status for [Strategy Name]"
- Focus on strategy names, not just IDs when possible
- If position has pending withdrawals, prioritize status check over new withdrawal

Make suggestions actionable and specific to the user's actual positions.
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Short action description",
      "text": "Natural message user would say"
    }
  ]
}
</output>`;
};
