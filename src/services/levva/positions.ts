// Position-related interfaces
export interface UserPosition {
  strategyId: number;
  balance: number;
  balanceUsd: number;
  hasPendingWithdrawals: boolean;
}

export interface WithdrawalRequest {
  vaultAddress: string;
  withdrawalNftAddress: string;
  requestId: number;
  isFinalized: boolean;
  amount: number;
  strategyId: number;
}

export interface PositionSummary {
  positions: UserPosition[];
  withdrawals: WithdrawalRequest[];
  hasPositions: boolean;
  hasPendingWithdrawals: boolean;
  totalPositionValue: number;
  positionsSummary: string;
  withdrawalsSummary: string;
}

/**
 * Format positions into human-readable summary
 */
export const formatPositionsSummary = (positions: UserPosition[]): string => {
  if (positions.length === 0) {
    return "No active positions";
  }

  return positions
    .map((pos) => {
      const strategyName = pos.strategyId ? `Strategy ${pos.strategyId}` : 'Unknown';
      const pendingNote = pos.hasPendingWithdrawals ? ' - Has pending withdrawals' : '';
      return `${strategyName}: $${pos.balanceUsd.toFixed(2)} (Balance: ${pos.balance})${pendingNote}`;
    })
    .join("\n");
};

/**
 * Format withdrawal requests into human-readable summary
 */
export const formatWithdrawalsSummary = (withdrawals: WithdrawalRequest[]): string => {
  const pendingWithdrawals = withdrawals.filter((req) => !req.isFinalized);
  
  if (pendingWithdrawals.length === 0) {
    return "No pending withdrawals";
  }

  return pendingWithdrawals
    .map((req) => {
      const status = req.isFinalized ? 'Finalized' : 'Pending';
      return `Request #${req.requestId}: ${req.amount} tokens from Strategy ${req.strategyId} (${status})`;
    })
    .join("\n");
};

/**
 * Create position summary from raw data
 */
export const createPositionSummary = (
  positions: UserPosition[], 
  withdrawals: WithdrawalRequest[]
): PositionSummary => {
  const hasPositions = positions.length > 0;
  const hasPendingWithdrawals = withdrawals.some((req) => !req.isFinalized);

  const totalPositionValue = positions.reduce(
    (sum, position) => sum + position.balanceUsd, 
    0
  );

  const positionsSummary = formatPositionsSummary(positions);
  const withdrawalsSummary = formatWithdrawalsSummary(withdrawals);

  return {
    positions,
    withdrawals,
    hasPositions,
    hasPendingWithdrawals,
    totalPositionValue,
    positionsSummary,
    withdrawalsSummary,
  };
};
