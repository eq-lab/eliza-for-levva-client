export interface WithdrawalStatusCheckParams {
  conversation: string;
  decision: any;
  positionsSummary: string;
  totalPositionValue: number;
  hasPositions: boolean;
  withdrawalsSummary: string;
  pendingRequestsCount: number;
  readyRequestsCount: number;
}

export const withdrawalStatusCheckPrompt = ({
  conversation,
  decision,
  positionsSummary,
  totalPositionValue,
  hasPositions,
  withdrawalsSummary,
  pendingRequestsCount,
  readyRequestsCount,
}: WithdrawalStatusCheckParams): string => {
  if (pendingRequestsCount === 0 && readyRequestsCount === 0 && !hasPositions) {
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
${positionsSummary}
Total Value: $${totalPositionValue.toFixed(2)}
Has Positions: ${hasPositions}
</currentPositions>
<withdrawalStatus>
${withdrawalsSummary}
Pending Requests: ${pendingRequestsCount}
Ready to Claim: ${readyRequestsCount}
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
