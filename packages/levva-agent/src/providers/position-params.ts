import { ModelType, type Provider, logger } from "@elizaos/core";
import { isHex } from "viem";
import {
  formatWithdrawIntent,
  WithdrawData,
} from "../actions/intents/withdraw";
import { DepositData, formatDepositIntent } from "../actions/intents/deposit";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import { INTENT_CONFIDENCE_THRESHOLD } from "../constants/intent";
import {
  ExtractedDataForWithdraw,
  extractWithdrawDataFromMessagePrompt,
  extractedDataForWithdrawSchema,
} from "src/prompts/withdraw";
import {
  ExtractedDataForDeposit,
  extractDepositDataFromMessagePrompt,
  extractedDataForDepositSchema,
} from "../prompts/deposit";
import { zodJsonSchema } from "../prompts/util";
import { RawMessage } from "../types/core";
import { LevvaService } from "../services/levva/class";
import { UserPosition, WithdrawalRequest } from "../services/levva/positions";
import { IntentManager, IntentContext } from "../services/intent-manager";
import { StrategyEntry } from "../services/levva/pool";
import { checkSimpleReply } from "./util";

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
  strategies: StrategyEntry[];
}

export const POSITION_PARAMS_PROVIDER_NAME = "position-params";

export const positionParamsProvider: Provider = {
  name: POSITION_PARAMS_PROVIDER_NAME,
  description: "Provides user position data and withdrawal request information",
  position: -50,
  async get(runtime, message, state) {
    logger.info(
      `[${POSITION_PARAMS_PROVIDER_NAME}] Provider started for: "${message.content.text}"`
    );

    // Check for simple reply mode first
    const simpleReply = checkSimpleReply(
      runtime,
      state,
      POSITION_PARAMS_PROVIDER_NAME,
      "Position data"
    );
    if (simpleReply) return simpleReply;

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

      // Use helper function to handle intent detection and creation with global threshold
      intentContext = await intentService.handleIntentDetectionAndCreation(
        message,
        LEVVA_ACTIONS.MANAGE_POSITIONS,
        userId,
        channelId,
        intentContext,
        INTENT_CONFIDENCE_THRESHOLD
      );

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

      let intentText = "";

      if (intentContext?.type === "WITHDRAW") {
        // Enhance positions with token decimal information for LLM
        const enhancedPositions = positions.map((pos) => {
          const strategy = strategies.find((s) => s.id === pos.strategyId);
          const token = strategy?.vault?.underlyingToken;
          return {
            ...pos,
            tokenSymbol: token?.symbol || "tokens",
            tokenDecimals: token?.decimals || 18,
          };
        });

        const prompt = extractWithdrawDataFromMessagePrompt({
          inheritedData: intentContext.inheritedData,
          returnData: intentContext.returnData,
          messages: intentContext.memories,
          strategyIdMap,
          positions: enhancedPositions as any, // Enhanced with token info
          withdrawals,
        });

        const result: ExtractedDataForWithdraw = await runtime.useModel(
          ModelType.OBJECT_SMALL,
          {
            prompt,
            schema: zodJsonSchema(extractedDataForWithdrawSchema),
            temperature: 0,
          }
        );

        if (result) {
          // Merge with previous and resolve strategy by id/name/risk similar to deposit
          const previousRaw = intentContext?.returnData ?? {};
          const previous: Partial<WithdrawData> = previousRaw;

          const combined: WithdrawData = {
            ...previous,
            ...result,
          } as WithdrawData;

          const matched: StrategyEntry | undefined =
            service.strategy.findStrategy(strategies, {
              strategyId: combined.strategyId,
              strategyName: combined.strategyName,
              strategyRisk: combined.strategyRisk,
            });

          if (matched) {
            combined.strategyId = matched.id;
          }

          intentContext = await intentService.updateIntent(
            intentContext,
            combined as any
          );

          intentText = formatWithdrawIntent(combined);
        }
      } else if (intentContext?.type === "DEPOSIT") {
        const strategyIdMap = strategies.reduce(
          (acc, strategy) => {
            acc[strategy.id] =
              `id: ${strategy.id}, name: "${strategy.name}", type: ${strategy.type}, risk: ${strategy.risk}`;
            return acc;
          },
          {} as Record<number, string>
        );

        // Get additional data needed for deposit context
        const [availableTokens, walletAssets] = await Promise.all([
          service.getAvailableTokens({ chainId }),
          service.getWalletAssets({ address: user.address, chainId }),
        ]);

        const availableStrategiesText = strategies
          .map((s) => {
            const lines = [
              `Strategy: ${s.name}`,
              `  Category: ${s.strategy}`,
              `  Name: ${s.name}`,
              `  ID: ${s.id}`,
              `  Risk: ${s.risk}`,
              `  Type: ${s.type}`,
            ];

            if (s.vault?.address) {
              lines.push(`  Contract: ${s.vault.address}`);
            } else if (s.pool?.address) {
              lines.push(`  Contract: ${s.pool.address}`);
            }

            if (s.shortDescription) {
              lines.push(`  Description: ${s.shortDescription}`);
            }

            return lines.join("\n");
          })
          .join("\n\n");

        const userPortfolioText = service.wallet.formatWalletAssets(
          walletAssets,
          true
        );

        const availableTokensText = availableTokens
          .map((token) => `${token.symbol} (${token.address})`)
          .join(", ");

        const prompt = extractDepositDataFromMessagePrompt({
          inheritedData: intentContext.inheritedData,
          returnData: intentContext.returnData,
          messages: intentContext.memories
            ?.map((m) => m.content.text)
            .join("\n"),
          strategyIdMap,
          availableStrategies: availableStrategiesText,
          userPortfolio: userPortfolioText,
          availableTokens: availableTokensText,
        });

        const result: ExtractedDataForDeposit = await runtime.useModel(
          ModelType.OBJECT_SMALL,
          {
            prompt,
            schema: zodJsonSchema(extractedDataForDepositSchema),
            temperature: 0,
          }
        );

        if (result) {
          // 1) Combine values from existing returnData and newly extracted result
          const previous = (intentContext?.returnData ||
            {}) as Partial<DepositData>;

          // Simple merge - priority system in findStrategy handles conflicts
          // Schema ensures LLM cannot return 'strategy' field, preventing overwrites
          const combined: DepositData = {
            ...previous,
            ...result,
          };

          // Clear previous strategy reference if any new strategy identifier provided
          if (
            result.strategyId !== undefined ||
            result.strategyName ||
            result.strategyRisk ||
            result.contractAddress
          ) {
            combined.strategy = undefined;
          }

          // 2) Match strategy using priority-based system
          // Priority: contractAddress > strategyId > strategyName > strategyRisk
          const matched: StrategyEntry | undefined =
            service.strategy.findStrategy(strategies, {
              strategyId: combined.strategyId,
              strategyName: combined.strategyName,
              strategyRisk: combined.strategyRisk,
              contractAddress: combined.contractAddress,
            });

          combined.strategy = matched;

          // For vault strategies, auto-fill token if still missing
          if (
            matched?.type === "vault" &&
            matched.vault?.underlyingToken &&
            !combined.tokenSymbol &&
            !combined.tokenAddress
          ) {
            combined.tokenSymbol = matched.vault.underlyingToken.symbol;
            combined.tokenAddress = matched.vault.underlyingToken.address;
          }

          // 3) Only then update the current intent
          intentContext = await intentService.updateIntent(
            intentContext,
            combined
          );

          intentText = formatDepositIntent(combined);
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

      // Generate context-specific text based on intent type
      let contextSpecificText = "";
      if (intentContext?.type === "DEPOSIT") {
        const availableStrategiesCount = strategies.length;
        contextSpecificText = `\n## Available Investment Strategies\n${availableStrategiesCount} strategies available across different risk profiles\n- Ultra-Safe: Low risk, stable returns\n- Safe: Moderate risk, balanced returns\n- Brave: Higher risk, potential for higher returns\n- Custom: Tailored strategies`;
      } else if (intentContext?.type === "WITHDRAW") {
        contextSpecificText = summary.hasPendingWithdrawals
          ? `\n## Withdrawal Options\nYou have pending withdrawals that may be ready to claim.`
          : `\n## Withdrawal Options\nYou can withdraw from any of your active positions.`;
      }

      const text = `## Current Positions
${summary.positionsSummary}

Total Portfolio Value: $${summary.totalPositionValue.toFixed(2)}
Overall Pending Withdrawals: ${summary.hasPendingWithdrawals ? "Yes" : "No"}${contextSpecificText}${intentText}`;

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
      logger.error(
        "Error in position params provider:",
        error instanceof Error ? error.message : String(error)
      );
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
