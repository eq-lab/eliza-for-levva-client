export interface ExchangePairsParams {
  conversation: string;
  decision: any;
  walletAssetsFormatted: string;
  availableTokens: Array<{
    symbol: string;
    address?: string;
  }>;
  intentContext?: any;
  recentIntents?: any[];
}

export const exchangePairsPrompt = ({
  conversation,
  decision,
  walletAssetsFormatted,
  availableTokens,
  intentContext,
  recentIntents,
}: ExchangePairsParams): string => {
  return `<task>
Generate suggestions for exchange pairs, given user's portfolio, intent context, and available tokens
</task>
<decision>
${JSON.stringify(decision)}
</decision>
<conversation>
${conversation}
</conversation>
<portfolio>
User has following tokens available in portfolio:
${walletAssetsFormatted}
</portfolio>
<availableTokens>
Tokens known to agent:
${availableTokens.map((token) => `${token.symbol} - ${token.address ?? "Native token"}`).join(", ")}
</availableTokens>
${intentContext ? `<activeIntent>
Current Intent ID: ${intentContext.id}
Intent Type: ${intentContext.type}
Intent Status: ${intentContext.status}
Intent Data: ${JSON.stringify(intentContext.returnData || {})}
</activeIntent>` : ''}
${recentIntents && recentIntents.length > 0 ? `<recentSwapHistory>
Recent swap intents (for context):
${recentIntents.map(intent => 
  `- ${intent.type} (${intent.status}): ${JSON.stringify(intent.returnData || {})}`
).join('\n')}
</recentSwapHistory>` : ''}
<instructions>
Generate 5 suggestions for exchange pairs based on:

1. **Portfolio Priority**: Prioritize tokens the user actually owns
2. **Intent Context**: If there's an active intent, consider its current state and data
3. **Recent History**: Learn from recent swap patterns to suggest relevant pairs
4. **Popular Pairs**: Include common trading pairs (ETH/USDC, ETH/USDT, etc.)
5. **Balance Considerations**: Suggest pairs where user has sufficient balance

For each suggestion:
- Use exact token symbols from availableTokens
- Prioritize tokens with non-zero balances in portfolio
- Consider gas efficiency (native token swaps, popular pairs)
- If active intent exists, suggest complementary or alternative pairs

Format suggestions as natural user messages like "Swap ETH to USDC" or "Exchange 50% of my USDT for ETH"
</instructions>
<keys>
- "suggestions" should be an array of objects with the following keys:
  - "label"
  - "text"
</keys>
<output>
Respond using JSON format like this:
{
  "suggestions": [
    {
      "label": "USDT -> ETH",
      "text": "I want to swap USDT to ETH",
    },
    {
      "label": "ETH -> USDT",
      "text": "Please, exchange ETH to USDT",
    },
    {
      "label": "ETH -> USDC",
      "text": "ETH for USDC",
    }
  ]
}

Your response should include the valid JSON block and nothing else.
</output>`;
};
