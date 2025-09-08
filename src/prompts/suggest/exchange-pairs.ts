import { IAgentRuntime } from "@elizaos/core";
import { LevvaService } from "../../services/levva/class";
import { LEVVA_SERVICE } from "../../constants/enum";

export interface ExchangePairsParams {
  address: `0x${string}`;
  chainId: number;
  conversation: string;
  decision: any;
}

export const exchangePairsPrompt = async (
  runtime: IAgentRuntime,
  { address, chainId, conversation, decision }: ExchangePairsParams
): Promise<string> => {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  const assets = await service.getWalletAssets({ address, chainId });
  const available = await service.getAvailableTokens({ chainId });

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
${service.formatWalletAssets(assets)}
</portfolio>
<availableTokens>
Tokens known to agent:
${available.map((token) => `${token.symbol} - ${token.address ?? "Native token"}`).join(", ")}
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
