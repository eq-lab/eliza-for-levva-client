export interface PositionManagementParams {
  conversation: string;
  decision: any;
  positionsSummary: string;
  totalPositionValue: number;
  withdrawalsSummary: string;
  hasPositions: boolean;
}

export const positionManagementPrompt = ({
  conversation,
  decision,
  positionsSummary,
  totalPositionValue,
  withdrawalsSummary,
  hasPositions,
}: PositionManagementParams): string => {
  // Only suggest if user has positions
  if (!hasPositions) {
    return `<task>Generate empty suggestions since user has no active positions</task>
<output>
{
  "suggestions": []
}
</output>`;
  }

  return `<task>Generate position management suggestions for user with active DeFi positions</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${positionsSummary}
Total Value: $${totalPositionValue.toFixed(2)}
</currentPositions>
<withdrawalStatus>
${withdrawalsSummary}
</withdrawalStatus>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4 position management suggestions:
1. "Check Positions" - to view current portfolio
2. "Withdraw Funds" - if user has significant positions
3. "Diversify Portfolio" - if concentrated in few strategies
4. "Strategy Analysis" - to analyze performance

Each suggestion should be actionable and relevant to their current positions.
</instructions>
<output>
{
  "suggestions": [
    {
      "label": "Check Positions",
      "text": "Show me my current positions"
    },
    {
      "label": "Withdraw Funds", 
      "text": "I want to withdraw some of my positions"
    },
    {
      "label": "Diversify Portfolio",
      "text": "Help me diversify my portfolio"
    },
    {
      "label": "Strategy Analysis",
      "text": "Analyze my strategy performance"
    }
  ]
}
</output>`;
};
