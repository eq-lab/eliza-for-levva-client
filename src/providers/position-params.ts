import { ModelType, type Provider, logger } from "@elizaos/core";
import { isHex } from "viem";
import { INTENT_TYPE, LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import { RawMessage } from "../types/core";
import { LevvaService } from "../services/levva/class";
import { UserPosition, WithdrawalRequest } from "../services/levva/positions";
import { IntentManager, IntentContext } from "../services/intent-manager";
import {
  ExtractedDataForWithdraw,
  extractWithdrawDataFromMessagePrompt,
} from "src/prompts/withdraw";
import { StrategiesResponse } from "src/api/levva/schema";

export interface PositionParamsProviderData {
  userPositions: UserPosition[];
  withdrawalRequests: WithdrawalRequest[];
  hasPositions: boolean;
  hasPendingWithdrawals: boolean;
  hasReadyWithdrawals: boolean;
  totalPositionValue: number;
  positionsSummary: string;
  withdrawalsSummary: string;
  intentContext?: IntentContext;
  strategies: StrategiesResponse;
}

export const POSITION_PARAMS_PROVIDER_NAME = "position-params";

export const positionParamsProvider: Provider = {
  name: POSITION_PARAMS_PROVIDER_NAME,
  description: "Provides user position data and withdrawal request information",
  position: -50,
  async get(runtime, message) {
    logger.info(
      `[POSITION-PARAMS] Provider started for: "${message.content.text}"`
    );
    try {
      const raw: RawMessage = (
        message.metadata as unknown as { raw: RawMessage }
      ).raw;

      const chainId = (raw.metadata.chainId ?? 1) as number;
      const userId = raw.senderId;
      const channelId = raw.channelId;

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
      const { summary, withdrawals, positions, strategies } =
        await service.getPositionSummary(user.address, chainId);

      // Handle intent management
      const intentService = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      if (!intentService) {
        throw new Error("Failed to get intent service");
      }

      let intentContext = await intentService.getActiveIntentByDomain(
        userId,
        channelId,
        LEVVA_ACTIONS.MANAGE_POSITIONS
      );

      const detect = await intentService.detectIntentWithLLM(
        message,
        LEVVA_ACTIONS.MANAGE_POSITIONS
      );

      if (detect.intentType) {
        if (detect.intentType !== intentContext?.type) {
          // TODO get parent intent by previous message's domain
          // do we need evaluator for that?
          intentContext = await intentService.createIntent({
            type: detect.intentType as INTENT_TYPE,
            domain: LEVVA_ACTIONS.MANAGE_POSITIONS,
            userId: userId,
            channelId: channelId,
            memories: [],
            returnData: detect.extractedValues || {},
            metadata: {
              detectedAt: Date.now(),
              confidence: detect.confidence,
              reasoning: detect.reasoning,
            },
          });

          runtime.logger.info(
            `Created new intent: ${intentContext.id} (${intentContext.type}) with confidence ${detect.confidence}`
          );
        }
      }

      if (intentContext) {
        await intentService.addMemoryToIntent(intentContext, message);
      }

      const strategyIdMap = strategies.reduce(
        (acc, strategy) => {
          acc[strategy.id] =
            `id: ${strategy.id}, name: "${strategy.name}", type: ${strategy.type}, risk: ${strategy.risk}`;
          return acc;
        },
        {} as Record<number, string>
      );

      if (intentContext?.type === "WITHDRAW") {
        const prompt = extractWithdrawDataFromMessagePrompt({
          inheritedData: intentContext.inheritedData,
          returnData: intentContext.returnData,
          messages: intentContext.memories,
          strategyIdMap,
          positions,
          withdrawals,
        });

        const result: ExtractedDataForWithdraw = await runtime.useModel(
          ModelType.OBJECT_SMALL,
          { prompt }
        );

        if (result) {
          // TODO proper typing for returnData
          intentContext.returnData = { ...intentContext.returnData, ...result };
          await intentService.storeIntent(intentContext);
        }
      }

      const data: PositionParamsProviderData = {
        userPositions: summary.positions,
        withdrawalRequests: summary.withdrawals,
        hasPositions: summary.hasPositions,
        hasPendingWithdrawals: summary.hasPendingWithdrawals,
        hasReadyWithdrawals: summary.hasReadyWithdrawals,
        totalPositionValue: summary.totalPositionValue,
        positionsSummary: summary.positionsSummary,
        withdrawalsSummary: summary.withdrawalsSummary,
        intentContext,
        strategies,
      };

      const intentText = intentContext
        ? `\n## Current Intent\nActive: ${intentContext.type} (${intentContext.id})\nStatus: ${intentContext.status}`
        : "";

      const text = `## Current Positions
${summary.positionsSummary}

Total Portfolio Value: $${summary.totalPositionValue.toFixed(2)}

## Withdrawal Status
${summary.withdrawalsSummary}
Overall Pending Withdrawals: ${summary.hasPendingWithdrawals ? "Yes" : "No"}${intentText}`;

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
          hasReadyWithdrawals: false,
          totalPositionValue: 0,
          positionsSummary: "Error loading positions",
          withdrawalsSummary: "Error loading withdrawal requests",
          strategies: [],
        } as PositionParamsProviderData,
      };
    }
  },
};
