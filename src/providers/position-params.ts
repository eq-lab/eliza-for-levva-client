import { type Provider, logger } from "@elizaos/core";
import { isHex } from "viem";
import { LEVVA_SERVICE } from "../constants/enum";
import { RawMessage } from "../types/core";
import { LevvaService } from "../services/levva/class";
import { UserPosition, WithdrawalRequest } from "../services/levva/positions";

export interface PositionParamsProviderData {
  userPositions: UserPosition[];
  withdrawalRequests: WithdrawalRequest[];
  hasPositions: boolean;
  hasPendingWithdrawals: boolean;
  totalPositionValue: number;
  positionsSummary: string;
  withdrawalsSummary: string;
}

export const POSITION_PARAMS_PROVIDER_NAME = "position-params";

export const positionParamsProvider: Provider = {
  name: POSITION_PARAMS_PROVIDER_NAME,
  description: "Provides user position data and withdrawal request information",
  position: -50,
  async get(runtime, message) {
    try {
      const raw: RawMessage = (
        message.metadata as unknown as { raw: RawMessage }
      ).raw;

      const chainId = (raw.metadata.chainId ?? 1) as number;
      const userId = raw.senderId;

      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const user = await service.getUserById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      // Validate that the user address is a valid hex string (Ethereum address format)
      if (!isHex(user.address)) {
        throw new Error(`Invalid Ethereum address format: ${user.address}`);
      }

      // Use LevvaService to get position summary with caching
      const summary = await service.getPositionSummary(user.address, chainId);

      const data: PositionParamsProviderData = {
        userPositions: summary.positions,
        withdrawalRequests: summary.withdrawals,
        hasPositions: summary.hasPositions,
        hasPendingWithdrawals: summary.hasPendingWithdrawals,
        totalPositionValue: summary.totalPositionValue,
        positionsSummary: summary.positionsSummary,
        withdrawalsSummary: summary.withdrawalsSummary,
      };

      const text = `## Current Positions
${summary.positionsSummary}

Total Portfolio Value: $${summary.totalPositionValue.toFixed(2)}

## Withdrawal Status
${summary.withdrawalsSummary}
Overall Pending Withdrawals: ${summary.hasPendingWithdrawals ? "Yes" : "No"}`;

      return {
        text,
        data,
        values: {
          positions: summary.positionsSummary,
          withdrawals: summary.withdrawalsSummary,
          totalValue: `$${summary.totalPositionValue.toFixed(2)}`,
        },
      };
    } catch (error) {
      logger.error("Error in position params provider:", error);
      return {
        text: "Failed to load position data",
        data: {
          userPositions: [],
          withdrawalRequests: [],
          hasPositions: false,
          hasPendingWithdrawals: false,
          totalPositionValue: 0,
          positionsSummary: "Error loading positions",
          withdrawalsSummary: "Error loading withdrawal requests",
        },
      };
    }
  },
};
