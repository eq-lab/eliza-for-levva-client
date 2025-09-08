import { IAgentRuntime } from "@elizaos/core";
import { LevvaService } from "../../services/levva/class";
import { LEVVA_SERVICE } from "../../constants/enum";

export interface PositionDiversificationParams {
  address: `0x${string}`;
  chainId: number;
  conversation: string;
  decision: any;
}

export const positionDiversificationPrompt = async (
  runtime: IAgentRuntime,
  { address, chainId, conversation, decision }: PositionDiversificationParams
): Promise<string> => {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  const [summary, strategies] = await Promise.all([
    service.getPositionSummary(address, chainId),
    service.getStrategies(chainId),
  ]);

  const availableStrategies = strategies.filter((strategy) => {
    const hasPosition = summary.positions.some(
      (pos: any) => pos.strategyId === strategy.contractAddress
    );
    return !hasPosition;
  });

  return `<task>Generate suggestions for portfolio diversification based on current positions and available strategies</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${summary.positionsSummary}
</currentPositions>
<availableStrategies>
${availableStrategies.map((s) => service.formatStrategy(s)).join("\n")}
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
