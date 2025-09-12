export interface PositionDiversificationParams {
  conversation: string;
  decision: any;
  positionsSummary: string;
  availableStrategiesFormatted: string;
  portfolioText?: string; // User's current token holdings
  hasEth?: boolean; // Whether user has ETH for WETH conversion
  currentRiskLevels?: string[]; // Risk levels user is already invested in
}

export const positionDiversificationPrompt = ({
  conversation,
  decision,
  positionsSummary,
  availableStrategiesFormatted,
  portfolioText,
  hasEth,
  currentRiskLevels,
}: PositionDiversificationParams): string => {
  const ethContext = hasEth
    ? `\nUser has ETH available for wrapping to WETH if needed for new strategy deposits.`
    : "";

  const riskContext =
    currentRiskLevels && currentRiskLevels.length > 0
      ? `\nCurrent risk exposure: ${currentRiskLevels.join(", ")}`
      : "";

  return `<task>Generate deposit-focused diversification suggestions based on current positions and available opportunities</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${positionsSummary}${riskContext}
</currentPositions>
<availableStrategies>
${availableStrategiesFormatted}
</availableStrategies>
<userPortfolio>
${portfolioText || "Portfolio information not available"}${ethContext}
</userPortfolio>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4-5 deposit-focused diversification suggestions that lead to new position creation:

DIVERSIFICATION PRIORITIES:
1. **Risk Level Diversification**: If concentrated in one risk level (ultra-safe, safe, brave), suggest complementary risk levels
2. **Strategy Type Balance**: If only in vaults, suggest pools (and vice versa) for different yield mechanisms
3. **Token Diversification**: Suggest strategies that use different tokens from current positions
4. **Yield Type Variety**: Mix lending, liquidity provision, and yield farming strategies
5. **ETH/WETH Utilization**: If user has ETH, suggest WETH-compatible strategies

SUGGESTION FORMATS:
- "Deposit into [Strategy Name]" - specific strategy with clear deposit intent
- "Add [Risk Level] Strategy" - diversify risk exposure with new deposits
- "Invest in [Token] Strategy" - utilize available tokens for diversification
- "Try [Strategy Type]" - explore different yield mechanisms
- "Wrap ETH and Deposit" - convert ETH for DeFi strategy access

Each suggestion should:
- Focus on NEW deposits rather than withdrawals
- Be specific about strategy names and tokens when possible
- Lead directly to deposit intent initiation
- Consider user's available tokens for feasibility
- Balance the overall portfolio risk and yield profile

AVOID generic suggestions - be specific about actual available strategies and user's tokens.
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Specific deposit action",
      "text": "Natural message that initiates deposit intent for diversification"
    }
  ]
}
</output>`;
};
