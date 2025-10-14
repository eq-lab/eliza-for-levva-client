export interface PositionManagementParams {
  conversation: string;
  decision: any;
  positionsSummary: string;
  totalPositionValue: number;
  withdrawalsSummary: string;
  hasPositions: boolean;
  availableStrategies?: string; // Available strategies for deposit suggestions
  portfolioText?: string; // User's current token holdings
  hasEth?: boolean; // Whether user has ETH for WETH conversion
  riskDistribution?: string; // Current risk distribution across positions
}

export const positionManagementPrompt = ({
  conversation,
  decision,
  positionsSummary,
  totalPositionValue,
  withdrawalsSummary,
  hasPositions,
  availableStrategies,
  portfolioText,
  hasEth,
  riskDistribution,
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

  const ethContext = hasEth
    ? `\nUser has ETH available for wrapping to WETH if needed for deposits.`
    : "";

  return `<task>Generate intelligent position management suggestions that consider deposit opportunities and portfolio optimization</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${positionsSummary}
Total Value: $${totalPositionValue.toFixed(2)}
</currentPositions>
<riskDistribution>
${riskDistribution || "Risk distribution not available"}
</riskDistribution>
<availableStrategies>
${availableStrategies || "Available strategies not provided"}
</availableStrategies>
<userPortfolio>
${portfolioText || "Portfolio information not available"}${ethContext}
</userPortfolio>
<withdrawalStatus>
${withdrawalsSummary}
</withdrawalStatus>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4-5 intelligent position management suggestions based on the user's current portfolio state:

PORTFOLIO ANALYSIS PRIORITIES:
1. **Position Optimization**: If user has successful positions, suggest increasing allocation
2. **Risk Rebalancing**: If concentrated in one risk level, suggest diversification deposits
3. **Strategy Diversification**: If limited to few strategies, suggest new strategy deposits
4. **Token Utilization**: If user has unused tokens, suggest deposit opportunities
5. **ETH/WETH Optimization**: If user has ETH, suggest WETH conversion for DeFi strategies

SUGGESTION TYPES TO CONSIDER:
- "Add to [Strategy Name]" - increase allocation to well-performing strategies
- "Diversify with [Risk Level]" - balance risk exposure with new deposits
- "Deposit [Token]" - utilize available tokens for new positions
- "Wrap ETH for DeFi" - convert ETH to WETH for strategy compatibility
- "Withdraw from [Strategy]" - reduce overexposed positions
- "Check Performance" - analyze current strategy performance
- "Rebalance Portfolio" - optimize overall allocation

Each suggestion should:
- Be specific to their actual positions and available tokens
- Consider deposit opportunities alongside withdrawal options
- Include actionable next steps that lead to deposit intents
- Balance growth opportunities with risk management

**CRITICAL: Generate USER MESSAGES, not agent responses**
The "text" field should be what the USER would TYPE to the agent, not what the agent would say back.

✅ CORRECT examples:
- "I want to add 50 USDC to Brave strategy"
- "Withdraw from ultra-safe position"
- "Show me strategy performance"
- "Wrap my ETH to WETH"

❌ WRONG examples (these are agent responses):
- "Consider increasing your allocation to..."
- "You could withdraw some funds from..."
- "To balance your portfolio's risk exposure..."
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Short, specific action",
      "text": "What the USER would type/say to initiate this action"
    }
  ]
}
</output>`;
};
