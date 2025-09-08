import { IAgentRuntime } from "@elizaos/core";
import { LevvaService } from "../../services/levva/class";
import { LEVVA_SERVICE } from "../../constants/enum";

export interface PositionManagementParams {
  address: `0x${string}`;
  chainId: number;
  conversation: string;
  decision: any;
}

export const positionManagementPrompt = async (
  runtime: IAgentRuntime,
  { address, chainId, conversation, decision }: PositionManagementParams
): Promise<string> => {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  const summary = await service.getPositionSummary(address, chainId);

  // Only suggest if user has positions
  if (!summary.hasPositions) {
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
${summary.positionsSummary}
Total Value: $${summary.totalPositionValue.toFixed(2)}
</currentPositions>
<withdrawalStatus>
${summary.withdrawalsSummary}
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
