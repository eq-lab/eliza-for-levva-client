export interface ExchangeAmountParams {
  conversation: string;
  decision: any;
  walletAssetsFormatted: string;
  availableTokens: Array<{
    symbol: string;
    address?: string;
  }>;
  intentContext?: any;
  swapParams?: any;
}

export const exchangeAmountPrompt = ({
  conversation,
  decision,
  walletAssetsFormatted,
  availableTokens,
  intentContext,
  swapParams,
}: ExchangeAmountParams): string => {
  return `<task>Generate suggestions for exchange amount or alternative swap pairs, given user's portfolio, intent context, and previous conversation
</task>
<decision>
${JSON.stringify(decision)}
</decision>
<portfolio>
User has following tokens available in portfolio:
${walletAssetsFormatted}
</portfolio>
<availableTokens>
Tokens known to agent:
${availableTokens.map((token) => `${token.symbol} - ${token.address ?? "Native token"}`).join(", ")}
</availableTokens>
${
  intentContext
    ? `<intentContext>
Active Intent ID: ${intentContext.id}
Intent Type: ${intentContext.type}
Intent Status: ${intentContext.status}
Intent Data: ${JSON.stringify(intentContext.returnData || {})}
Intent Memories: ${intentContext.memories?.length || 0} messages
</intentContext>`
    : ""
}
${
  swapParams
    ? `<currentSwapParams>
Token In: ${swapParams.tokenIn?.symbol || "Unknown"}
Token Out: ${swapParams.tokenOut?.symbol || "Unknown"}
Amount: ${swapParams.amount || "Not specified"}
Type: ${swapParams.type || "Unknown"}
</currentSwapParams>`
    : ""
}
<conversation>
${conversation}
</conversation>
<instructions>
Generate smart amount suggestions based on portfolio, intent context, and conversation:

**Intent-Aware Logic:**
- If active intent exists with partial data, build upon it
- If current swap params specify tokens, focus on amount suggestions
- If recent intents show patterns, suggest similar amounts

**Portfolio-Based Suggestions:**
1. When input token NOT in portfolio:
  - Generate 4 suggestions for alternative input tokens from portfolio
  - Input token ≠ output token (no self-swaps)
  - Acknowledge missing token: "No {{tokenIn}}, swap {{availableToken}} -> {{tokenOut}}"
  - Text without amounts: "I want to swap {{availableToken}} to {{tokenOut}}"

2. When input token IS in portfolio:
  - Generate 4 amount suggestions: 100% (or 95% for native), 50%, 25%, 10% of balance
  - Show trimmed amounts in labels: "0.12 {{tokenIn}}" (6 decimals if <1, 2 decimals if ≥1)
  - Use full precision in text: "I want to swap 0.123456789987654321 {{tokenIn}}"

**Smart Enhancements:**
- Consider gas costs for native token (suggest 95% not 100%)
- Factor in recent successful swap amounts
- Prioritize tokens with higher balances
- Include popular round numbers when appropriate

Use intent context and swap params to make contextually relevant suggestions.
</instructions>
<keys>
- "thought" should be a short description of what the agent is thinking about and planning.
- "suggestions" should be an array of objects with the following keys:
  - "label" - short description of the suggestion
  - "text" - message containing untrimmed swap amount 
</keys>
<output>
Respond using JSON format like this:
{
  "thought": "<string>",
  "suggestions": <array>
}

Your response should include the valid JSON block and nothing else.
</output>`;
};
