export interface WithdrawalAmountSuggestionsParams {
  conversation: string;
  decision: any;
  strategyId: number;
  strategyName: string;
  balance: number;
  balanceUsd: number;
  hasPendingWithdrawals: boolean;
}

export const withdrawalAmountSuggestionsPrompt = ({
  conversation,
  decision,
  strategyId,
  strategyName,
  balance,
  balanceUsd,
  hasPendingWithdrawals,
}: WithdrawalAmountSuggestionsParams): string => {
  return `<task>Generate amount-based withdrawal suggestions when user has specified strategy but not amount</task>
<decision>
${JSON.stringify(decision)}
</decision>
<positionDetails>
Strategy: ${strategyName} (ID: ${strategyId})
Balance: ${balance} tokens ($${balanceUsd.toFixed(2)})
Has Pending Withdrawals: ${hasPendingWithdrawals}
</positionDetails>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4 withdrawal amount suggestions following the percentage pattern:

1. **25% Withdrawal**: Quarter of the position
2. **66% Withdrawal**: Two-thirds of the position  
3. **100% Withdrawal**: Complete exit from position
4. **Custom Amount**: Encourage user to specify their own amount

For each suggestion:
- Label should show the percentage and trimmed amount: "25% (X.XX tokens)" 
- Text should be a natural message with precise amount: "I want to withdraw X.XXXXXX from [Strategy Name]"
- Use full precision in text (up to 6 decimal places)
- Use 2 decimal places in labels for readability
- Include strategy name in text when possible

Amount calculations:
- 25%: ${(balance * 0.25).toFixed(6)} tokens ($${(balanceUsd * 0.25).toFixed(2)})
- 66%: ${(balance * 0.66).toFixed(6)} tokens ($${(balanceUsd * 0.66).toFixed(2)})
- 100%: ${balance.toFixed(6)} tokens ($${balanceUsd.toFixed(2)})

${hasPendingWithdrawals ? "Note: Position has pending withdrawals - mention this context in suggestions." : ""}
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Percentage and trimmed amount",
      "text": "Natural withdrawal message with precise amount"
    }
  ]
}
</output>`;
};
