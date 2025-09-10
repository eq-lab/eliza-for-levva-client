export interface ExchangePairsParams {
  conversation: string;
  decision: any;
  walletAssetsFormatted: string;
  availableTokens: Array<{
    symbol: string;
    address?: string;
  }>;
}

export const exchangePairsPrompt = ({
  conversation,
  decision,
  walletAssetsFormatted,
  availableTokens,
}: ExchangePairsParams): string => {
  return `<task>
Generate suggestions for exchange pairs, given user's portfolio and available tokens
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
<instructions>
Generate 5 suggestions for exchange pairs
Please include exact token symbol for suggestion text.
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
