import { IAgentRuntime } from "@elizaos/core";
import { LevvaService } from "../../services/levva/class";
import { LEVVA_SERVICE } from "../../constants/enum";

export interface ExchangeAmountParams {
  address: `0x${string}`;
  chainId: number;
  conversation: string;
  decision: any;
}

export const exchangeAmountPrompt = async (
  runtime: IAgentRuntime,
  { address, chainId, conversation, decision }: ExchangeAmountParams
): Promise<string> => {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  const assets = await service.getWalletAssets({ address, chainId });
  const available = await service.getAvailableTokens({ chainId });

  return `<task>Generate suggestions for exchange amount or alternative swap pairs, given user's portfolio and previous conversation
</task>
<decision>
${JSON.stringify(decision)}
</decision>
<portfolio>
User has following tokens available in portfolio:
${service.formatWalletAssets(assets)}
</portfolio>
<availableTokens>
Tokens known to agent:
${available.map((token) => `${token.symbol} - ${token.address ?? "Native token"}`).join(", ")}
</availableTokens>
<conversation>
${conversation}
</conversation>
<instructions>
User can either have the input token available or not, so consider cases:

1. When input token NOT in portfolio:
  - Generate 4 suggestions for another input token available in portfolio without token amount.
  - Input token should NOT be the same as the output token, so "Swap ETH -> USDT" is CORRECT, but "Swap ETH -> ETH" is WRONG.
  - Acknowledge missing input token in label, eg. "No {{tokenIn}}, swap {{availableToken}} -> {{tokenOut}}".
  - Text should NOT include amount, eg. "I want to swap {{availableToken}} to {{tokenOut}}" is CORRECT, but "I want to swap 0.123456789987654321 {{availableToken}} to {{tokenOut}}" is WRONG.

2. When input token IS in portfolio:
  - Generate 4 suggestions for exchange amount, that corresponds to 100%(or 95% instead for native token or deduced value if present), 50%, 25%, 10% of the input token balance.
  - User should be able to see trimmed swap amount in suggestion label, but not the percentage, eg. NOT "100% {{tokenIn}}", but "0.12 {{tokenIn}}".
  - Trim amount in label to 6 decimal places if the value is less than 1. Use 2 decimal places otherwise, eg. "0.12 {{tokenIn}}".
  - Do not trim amount in text, eg. "I want to swap 0.123456789987654321 {{tokenIn}}".

Determine if user has input token available in portfolio and use appropriate case.
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
