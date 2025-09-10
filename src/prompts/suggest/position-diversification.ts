export interface PositionDiversificationParams {
  conversation: string;
  decision: any;
  positionsSummary: string;
  availableStrategiesFormatted: string;
}

export const positionDiversificationPrompt = ({
  conversation,
  decision,
  positionsSummary,
  availableStrategiesFormatted,
}: PositionDiversificationParams): string => {
  return `<task>Generate suggestions for portfolio diversification based on current positions and available strategies</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${positionsSummary}
</currentPositions>
<availableStrategies>
${availableStrategiesFormatted}
</availableStrategies>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4 suggestions for diversifying the portfolio:
1. Suggest different risk levels if user is concentrated in one risk category
2. Suggest different strategy types (vault vs pool) for balance
3. Consider withdrawal options if overexposed
4. Suggest rebalancing based on performance

Each suggestion should be actionable and specific.
</instructions>
<output>
{
  "suggestions": [
    {
      "label": "Add Safe Strategy",
      "text": "I want to diversify with a safe strategy"
    },
    {
      "label": "Withdraw 25%", 
      "text": "I want to withdraw 25% of my positions"
    }
  ]
}
</output>`;
};
