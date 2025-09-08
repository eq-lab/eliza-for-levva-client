// Position-related interfaces
export interface UserPosition {
  strategyId: number;
  balance: number;
  balanceUsd: number;
  hasPendingWithdrawals: boolean;
}

export interface Strategy {
  id: number;
  name: string;
  description: string;
  shortDescription: string;
  backgroundColor: string | null;
  type: string;
  category: string;
  risk: string;
  minimumEfficientDeposit: number;
  liquidityAvailability: string;
  vault?: {
    id: number;
    publicChainId: number;
    address: string;
    name: string | null;
    underlyingToken: {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      priceUsd: number;
    };
    lpToken: {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      priceUsd: number;
    };
    lpTotalSupply: number;
    performanceFee: number;
    managementFee: number;
    totalAssets: number;
    currentApy: number;
    minDeposit: number;
    createdAt: string;
  };
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
export const formatPositionsSummary = (
  positions: UserPosition[],
  strategies: Strategy[] = [],
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

      return `${strategyName}: $${pos.balanceUsd.toFixed(2)} (Balance: ${balanceDisplay})${pendingNote}`;
    })
    .join("\n");
};

/**
 * Format withdrawal requests into human-readable summary
 */
export const formatWithdrawalsSummary = (
  withdrawals: WithdrawalRequest[]
): string => {
  const pendingWithdrawals = withdrawals.filter((req) => !req.isFinalized);

  if (pendingWithdrawals.length === 0) {
    return "No pending withdrawals";
  }

  return pendingWithdrawals
    .map((req) => {
      const status = req.isFinalized ? "Finalized" : "Pending";
      return `Request #${req.requestId}: ${req.amount} tokens from Strategy ${req.strategyId} (${status})`;
    })
    .join("\n");
};

/**
 * Create position summary from raw data
 */
export const createPositionSummary = (
  positions: UserPosition[],
  withdrawals: WithdrawalRequest[],
  strategies: Strategy[] = []
): PositionSummary => {
  const hasPositions = positions.length > 0;

  // FIXED: Use withdrawal requests as the source of truth for pending status
  // The hasPendingWithdrawals flag in positions should match !isFinalized in withdrawal requests
  const hasPendingWithdrawals = withdrawals.some((req) => !req.isFinalized);

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
    totalPositionValue,
    positionsSummary,
    withdrawalsSummary,
  };
};
