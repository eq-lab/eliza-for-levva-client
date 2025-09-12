export interface WithdrawalGuidanceParams {
  conversation: string;
  decision: any;
  positionsSummary: string;
  totalPositionValue: number;
  hasPositions: boolean;
}

export const withdrawalGuidancePrompt = ({
  conversation,
  decision,
  positionsSummary,
  totalPositionValue,
  hasPositions,
}: WithdrawalGuidanceParams): string => {
  if (!hasPositions) {
    return `<task>Generate empty suggestions since user has no positions to withdraw from</task>
<output>
{
  "suggestions": []
}
</output>`;
  }

  return `<task>Generate withdrawal guidance suggestions for user wanting to exit positions</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${positionsSummary}
Total Value: $${totalPositionValue.toFixed(2)}
</currentPositions>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4 withdrawal guidance suggestions for someone wanting to exit positions:

1. "Withdraw All" - for complete portfolio exit
2. "Withdraw Specific" - for targeted position withdrawal  
3. "Partial Withdrawal" - for reducing exposure while maintaining positions
4. "Check Fees" - to understand withdrawal costs and timing

Focus on practical next steps for someone ready to withdraw funds.
Each suggestion should guide them through the withdrawal process.
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Short action description", 
      "text": "Specific withdrawal instruction"
    }
  ]
}
</output>`;
};
