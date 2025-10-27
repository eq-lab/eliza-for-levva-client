export interface DepositOpportunitiesParams {
  conversation: string;
  decision: any;
  positionsSummary: string;
  totalPositionValue: number;
  hasPositions: boolean;
  availableStrategies: string;
  portfolioText: string;
  hasEth: boolean;
  significantTokens: string[]; // Tokens with significant balances
}

export const depositOpportunitiesPrompt = ({
  conversation,
  decision,
  positionsSummary,
  totalPositionValue,
  hasPositions,
  availableStrategies,
  portfolioText,
  hasEth,
  significantTokens,
}: DepositOpportunitiesParams): string => {
  const ethContext = hasEth
    ? `\nUser has ETH available for wrapping to WETH if needed for deposits.`
    : "";

  const positionContext = hasPositions
    ? `\nCurrent positions value: $${totalPositionValue.toFixed(2)}`
    : "\nUser has no current positions - perfect opportunity for first deposits.";

  return `<task>Generate specific deposit opportunity suggestions based on user's portfolio and position analysis</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${positionsSummary}${positionContext}
</currentPositions>
<availableStrategies>
${availableStrategies}
</availableStrategies>
<userPortfolio>
${portfolioText}${ethContext}
</userPortfolio>
<significantTokens>
User has significant balances in: ${significantTokens.join(", ")}
</significantTokens>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4-5 specific deposit opportunity suggestions that directly lead to deposit intents:

DEPOSIT OPPORTUNITY PRIORITIES:
1. **Token-Strategy Matching**: Match user's significant token balances with compatible strategies
2. **Portfolio Growth**: Suggest deposits that complement existing positions (if any)
3. **Risk-Appropriate Deposits**: Balance risk based on current exposure or user preferences
4. **ETH/WETH Utilization**: If user has ETH, suggest WETH-compatible strategies
5. **First-Time Deposits**: If no positions, suggest beginner-friendly strategies

SUGGESTION FORMATS (use natural, conversational language):
- "I want to deposit 100 USDC into the Ultra-Safe strategy" - specific amounts with real tokens
- "Let me invest some ETH in a safe strategy" - natural language with available tokens
- "I'd like to try the Brave strategy with 50 USDC" - conversational deposit request
- "Deposit 0.1 ETH into the Safe strategy" - realistic amounts user would actually say
- "I want to start with the Ultra-Safe strategy using USDC" - beginner-friendly language

CRITICAL REQUIREMENTS:
- Use REAL token amounts that make sense (10-1000 USDC, 0.01-1 ETH, etc.)
- Reference actual strategy names from availableStrategies
- Use tokens the user actually has in significant amounts
- Write suggestions as if the USER is speaking, not the agent
- Make suggestions immediately actionable without asking for more info
- Avoid placeholder text like [Amount] or [Token] - use real values

CONTEXT AWARENESS:
- If user has positions: suggest complementary deposits
- If user has no positions: suggest starter strategies
- If user has ETH: prioritize WETH-compatible strategies
- If user has stablecoins: suggest stable yield strategies
- If user has volatile tokens: suggest appropriate risk strategies

CONVERSATION AWARENESS:
- If user already mentioned a strategy, build on that (don't repeat the same suggestion)
- If user already mentioned a token, use that token in suggestions
- If user already mentioned an amount, suggest similar or complementary amounts
- If conversation shows user is interested in specific risk level, focus on that

AVOID:
- Generic suggestions without specific strategies
- Suggestions for tokens user doesn't have
- Vague recommendations that don't lead to action
- Placeholder text like [Amount], [Token], [Strategy] - use real values
- Asking for information the user already provided in conversation
- Repetitive suggestions that ignore conversation context
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Specific deposit action with token and strategy",
      "text": "Natural message that directly initiates deposit intent"
    }
  ]
}
</output>`;
};
