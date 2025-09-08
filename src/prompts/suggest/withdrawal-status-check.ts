import { IAgentRuntime } from "@elizaos/core";
import { LevvaService } from "../../services/levva/class";
import { LEVVA_SERVICE } from "../../constants/enum";

export interface WithdrawalStatusCheckParams {
  address: `0x${string}`;
  chainId: number;
  conversation: string;
  decision: any;
}

export const withdrawalStatusCheckPrompt = async (
  runtime: IAgentRuntime,
  { address, chainId, conversation, decision }: WithdrawalStatusCheckParams
): Promise<string> => {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("Failed to get levva service");
  }

  const summary = await service.getPositionSummary(address, chainId);
  const withdrawalRequests = await service.getWithdrawalRequests(
    address,
    chainId
  );

  // Check current withdrawal state
  const pendingRequests = withdrawalRequests.filter((req) => !req.isFinalized);
  const readyRequests = withdrawalRequests.filter((req) => req.isFinalized);

  if (
    pendingRequests.length === 0 &&
    readyRequests.length === 0 &&
    !summary.hasPositions
  ) {
    return `<task>Generate empty suggestions since user has no positions or withdrawals</task>
<output>
{
  "suggestions": []
}
</output>`;
  }

  return `<task>Generate withdrawal-related suggestions based on current withdrawal state</task>
<decision>
${JSON.stringify(decision)}
</decision>
<currentPositions>
${summary.positionsSummary}
Total Value: $${summary.totalPositionValue.toFixed(2)}
Has Positions: ${summary.hasPositions}
</currentPositions>
<withdrawalStatus>
${summary.withdrawalsSummary}
Pending Requests: ${pendingRequests.length}
Ready to Claim: ${readyRequests.length}
</withdrawalStatus>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 3-4 contextual withdrawal suggestions based on the user's current state:

IF user has READY TO CLAIM requests:
- "Claim Funds" - to claim finalized withdrawals
- "Check All Withdrawals" - to see complete status

IF user has PENDING requests (waiting for finalization):
- "Check Status" - to monitor withdrawal progress  
- "Manage Positions" - to view other portfolio options while waiting

IF user has POSITIONS but no withdrawals:
- "Start Withdrawal" - to begin withdrawal process
- "Partial Withdrawal" - to withdraw portion of funds

IF user has both positions and pending withdrawals:
- "Check Status" - priority for pending withdrawals
- "Manage Portfolio" - to handle other positions

Each suggestion should be actionable and relevant to their current withdrawal state.
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Short action description",
      "text": "Specific instruction for what to do"
    }
  ]
}
</output>`;
};
