import { StrategyEntry } from "./pool";

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
  hasReadyWithdrawals: boolean;
  totalPositionValue: number;
  positionsSummary: string;
  withdrawalsSummary: string;
}

/**
 * Format positions into human-readable summary
 */
export const formatPositionsSummary = (
  positions: UserPosition[],
  strategies: StrategyEntry[] = [],
  withdrawals: WithdrawalRequest[] = []
): string => {
  if (positions.length === 0) {
    return "No active positions";
  }

  return positions
    .map((pos) => {
      const strategy = strategies.find((s) => s.id === pos.strategyId);
      const strategyName = strategy
        ? strategy.name
        : `Strategy ${pos.strategyId}`;
      const assetSymbol = strategy?.vault?.underlyingToken?.symbol || "";
      const balanceDisplay = assetSymbol
        ? `${pos.balance} ${assetSymbol}`
        : pos.balance.toString();

      // FIXED: Use withdrawal requests as single source of truth for pending status
      const hasPendingWithdrawals = withdrawals.some(
        (req) => req.strategyId === pos.strategyId && !req.isFinalized
      );
      const pendingNote = hasPendingWithdrawals ? " - Pending withdrawals" : "";

      return `${strategy?.strategy} ${strategyName}: $${pos.balanceUsd.toFixed(2)} (Balance: ${balanceDisplay})${pendingNote}`;
    })
    .join("\n");
};

/**
 * Format withdrawal requests into human-readable summary
 */
export const formatWithdrawalsSummary = (
  withdrawals: WithdrawalRequest[]
): string => {
  if (withdrawals.length === 0) {
    return "No withdrawal requests";
  }

  const pendingWithdrawals = withdrawals.filter((req) => !req.isFinalized);
  const readyWithdrawals = withdrawals.filter((req) => req.isFinalized);

  const summaryParts: string[] = [];

  if (pendingWithdrawals.length > 0) {
    summaryParts.push(
      `**Pending**: ${pendingWithdrawals.length} request(s) processing`
    );
  }

  if (readyWithdrawals.length > 0) {
    summaryParts.push(
      `**Ready to Claim**: ${readyWithdrawals.length} request(s) ready`
    );
  }

  if (summaryParts.length === 0) {
    return "No withdrawal requests";
  }

  return summaryParts.join(", ");
};

/**
 * Create position summary from raw data
 */
export const createPositionSummary = (
  positions: UserPosition[],
  withdrawals: WithdrawalRequest[],
  strategies: StrategyEntry[] = []
): PositionSummary => {
  const hasPositions = positions.length > 0;

  // FIXED: Use withdrawal requests as the source of truth for pending status
  // The hasPendingWithdrawals flag in positions should match !isFinalized in withdrawal requests
  const hasPendingWithdrawals = withdrawals.some((req) => !req.isFinalized);
  const hasReadyWithdrawals = withdrawals.some((req) => req.isFinalized);

  const totalPositionValue = positions.reduce(
    (sum, position) => sum + position.balanceUsd,
    0
  );

  const positionsSummary = formatPositionsSummary(
    positions,
    strategies,
    withdrawals
  );
  const withdrawalsSummary = formatWithdrawalsSummary(withdrawals);

  return {
    positions,
    withdrawals,
    hasPositions,
    hasPendingWithdrawals,
    hasReadyWithdrawals,
    totalPositionValue,
    positionsSummary,
    withdrawalsSummary,
  };
};
