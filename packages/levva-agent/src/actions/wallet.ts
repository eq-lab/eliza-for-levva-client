import { formatUnits, isHex } from "viem";
import { Action } from "@elizaos/core";
import { INTENT_TYPE, LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import { INTENT_CONFIDENCE_THRESHOLD } from "../constants/intent";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import { selectProviderState } from "../providers/util";
import type { LevvaService } from "../services/levva/class";
import { rephrase } from "../util/generate";
import { Suggestion } from "./types";
import { getPreviousReplyContext } from "../util/action-results";
import { ETH_NULL_ADDR } from "../constants/eth";
import { USD_DECIMALS } from "../constants/math";
import { IntentManager } from "../services/intent-manager";
import { blockexplorers } from "../util/eth/client";
import { handleSendIntent, generateSendSuggestions } from "./intents";
import { formatCoin } from "src/util/format-coin";

const getExplorerLink = (chainId: number, address: string): string => {
  const explorer = blockexplorers.get(chainId);
  return explorer ? `[Explorer](${explorer}/address/${address})` : address;
};

// Register the send intent
IntentManager.registerIntent({
  type: INTENT_TYPE.SEND,
  domain: LEVVA_ACTIONS.ANALYZE_WALLET,
  keywords: [
    "send",
    "transfer",
    "donate",
    // Removed ambiguous keywords:
    // - "pay" (can trigger on questions: "what can I pay with?")
    // - "move" (too generic: "move funds between strategies")
    // - "give" (conversational: "give me details")
  ],
  handler: handleSendIntent,
  generateSuggestions: generateSendSuggestions,
  description: "Handle token transfer requests with multi-step process support",
});

export const action: Action = {
  name: LEVVA_ACTIONS.ANALYZE_WALLET,
  description: `Provides comprehensive wallet and portfolio analysis including asset breakdown, risk assessment, diversification insights, and actionable investment recommendations based on current holdings and market conditions. Also handles token transfers and sends.`,
  similes: [
    "ANALYZE_WALLET",
    "ANALYZE_PORTFOLIO",
    "analyze wallet",
    "analyze portfolio",
    "my assets",
    "my portfolio",
    "portfolio",
    "wallet analysis",
    "portfolio breakdown",
    "asset analysis",
    "show my holdings",
    "portfolio summary",
    "wallet overview",
    "investment analysis",
    "send tokens",
    "transfer tokens",
    "send money",
    "transfer funds",
    "pay someone",
  ],

  validate: async () => {
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    // Get previous action context BEFORE try block for error handling
    const prevActions = await getPreviousReplyContext(runtime, message, state);

    // Compose state with required providers
    const composedState = await runtime.composeState(
      message,
      [LEVVA_PROVIDER_NAME],
      true
    );

    try {
      // Check for SEND intent first using centralized service
      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );
      if (intentManager) {
        const userId = (message as any).userId || "unknown";
        const channelId =
          (message.metadata as any)?.raw?.channelId || message.roomId;

        // Check for existing SEND intent
        let intentContext = await intentManager.getActiveIntentByDomain(
          userId,
          channelId,
          LEVVA_ACTIONS.ANALYZE_WALLET
        );

        // Use centralized intent detection with global threshold
        intentContext = await intentManager.handleIntentDetectionAndCreation(
          message,
          LEVVA_ACTIONS.ANALYZE_WALLET,
          userId,
          channelId,
          intentContext,
          INTENT_CONFIDENCE_THRESHOLD
        );

        // If we have a SEND intent, handle it
        if (intentContext?.type === INTENT_TYPE.SEND) {
          return await handleSendIntent(
            runtime,
            message,
            composedState,
            callback!,
            intentContext,
            prevActions
          );
        }
      }

      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service, disable action");
      }

      if (!callback) {
        throw new Error("Callback not found, disable action");
      }

      const levvaState = selectProviderState<LevvaProviderState>(
        LEVVA_PROVIDER_NAME,
        composedState
      );

      if (!levvaState?.user) {
        throw new Error("User address ID is required");
      }

      const { chainId, user } = levvaState;
      const { address } = user;

      if (!isHex(address)) {
        throw new Error("User not found");
      }

      const [assets, news, strategies, positions] = await Promise.all([
        service.getWalletAssets({ chainId, address }),
        service.getCryptoNews(),
        service.strategy.getStrategies(chainId),
        service.getUserPositions(address, chainId),
      ]);

      // Enhanced portfolio analysis with insights
      const assetsWithValues = assets.filter((a) => a.amount > 0);

      const portfolioSummary = assetsWithValues
        .map((asset) => {
          const isNative = !asset.token || asset.token === ETH_NULL_ADDR;

          const token = service.token.getTokenFromMap({
            chainId: asset.chainId,
            address: (asset.token ?? ETH_NULL_ADDR) as `0x${string}`,
          });

          const decimals = token?.decimals ?? 18;
          const symbol = token?.symbol ?? "ETH";

          const balance = formatUnits(asset.amount, decimals);
          return `- **${symbol}**: ${formatCoin(balance)} ${isNative ? "Native token" : getExplorerLink(asset.chainId, asset.token)}`;
        })
        .join("\n");

      const totalValue = assets.reduce(
        (sum, asset) =>
          sum + parseFloat(formatUnits(asset.value, USD_DECIMALS)),
        0
      );

      // ETH detection for conversion opportunities
      const ethAsset = assets.find(
        (asset) =>
          asset.token === ETH_NULL_ADDR || asset.address === ETH_NULL_ADDR
      );
      const hasEth = ethAsset ? ethAsset.amount > 0n : false;

      // Risk and diversification analysis
      const tokenCount = assets.length;
      const largestHolding = Math.max(
        ...assets.map((a) => parseFloat(formatUnits(a.value, USD_DECIMALS)))
      );
      const concentrationRisk =
        totalValue > 0 ? (largestHolding / totalValue) * 100 : 0;

      // Position analysis
      const activePositions = positions.filter((p) => p.balance > 0);
      const totalPositionValue = activePositions.reduce(
        (sum, pos) => sum + pos.balanceUsd,
        0
      );

      // Strategy recommendations based on holdings
      const recommendedStrategies = strategies
        .filter((s) => {
          // Include strategies that:
          // 1. Support ETH if user has ETH
          // 2. Support common tokens (USDC, WETH, etc.)
          // 3. Are generally available strategies
          return (
            (hasEth && s.description.toLowerCase().includes("eth")) ||
            s.description.toLowerCase().includes("usdc") ||
            s.description.toLowerCase().includes("stable") ||
            s.category.toLowerCase().includes("safe") ||
            s.category.toLowerCase().includes("yield")
          );
        })
        .slice(0, 3);

      // Debug logging to understand strategy properties
      runtime.logger.info("Strategy filtering debug:", {
        totalStrategies: strategies.length,
        filteredStrategies: recommendedStrategies.length,
        firstRawStrategy: strategies[0]
          ? {
              id: strategies[0].id,
              name: strategies[0].name,
              risk: strategies[0].risk,
              category: strategies[0].category,
              description: strategies[0].description?.substring(0, 100),
            }
          : null,
      });

      if (recommendedStrategies.length > 0) {
        runtime.logger.info("Strategy properties debug:", {
          firstStrategy: {
            id: recommendedStrategies[0].id,
            name: recommendedStrategies[0].name,
            risk: recommendedStrategies[0].risk,
            hasName: !!recommendedStrategies[0].name,
            hasRisk: !!recommendedStrategies[0].risk,
          },
        });
      }

      const content = {
        text: `## Portfolio Analysis

### 💰 **Asset Overview**
${portfolioSummary}
**Total Portfolio Value**: $${totalValue.toFixed(2)}

### 📊 **Portfolio Insights**
- **Diversification**: ${tokenCount} different tokens
- **Concentration Risk**: ${concentrationRisk.toFixed(1)}% in largest holding
${hasEth ? "- **ETH Available**: Can be wrapped to WETH for DeFi strategies" : ""}

### 🏦 **Active Positions**
${
  activePositions.length > 0
    ? `- **Active Strategies**: ${activePositions.length} positions
- **Total Position Value**: $${totalPositionValue.toFixed(2)}
${activePositions
  .map((p) => {
    const strategy = strategies.find((s) => s.id === p.strategyId);
    const strategyName = strategy?.name || `Strategy ${p.strategyId}`;
    return `  • ${strategyName}: $${p.balanceUsd.toFixed(2)}`;
  })
  .join("\n")}`
    : "- **No Active Positions**: Ready to start investing"
}

### 🎯 **Recommended Next Steps**
${
  recommendedStrategies.length > 0
    ? recommendedStrategies
        .map((s) => {
          const strategyName = (s.name && s.name.trim()) || `Strategy ${s.id}`;
          const riskLevel = (s.risk && s.risk.trim()) || "Unknown Risk";
          const description =
            (s.shortDescription && s.shortDescription.trim()) ||
            (s.description && s.description.trim()) ||
            "No description available";
          return `- **${strategyName}** (${riskLevel}): ${description}`;
        })
        .join("\n")
    : "- Explore available strategies based on your token holdings"
}

### 📈 **Market Context**
${news
  .slice(0, 2)
  .map((n) => `- ${n.description}`)
  .join("\n")}`,
        thought:
          "Providing comprehensive portfolio analysis with risk assessment, diversification insights, position overview, and personalized strategy recommendations based on user's holdings.",
        actions: ["ANALYZE_WALLET"],
        source: message.content.source,
      };

      const responseContent = await rephrase({
        runtime,
        content,
        state: composedState,
        prevActions,
      });

      await callback(responseContent);

      return {
        text: `Generated text: ${responseContent?.text}`,
        values: {
          success: true,
          responded: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: `${LEVVA_ACTIONS.ANALYZE_WALLET}`,
          response: responseContent,
          thought: responseContent?.thought,
          initialReply: content.text,
          initialThought: content.thought,
          messageGenerated: true,
        },
        success: true,
      };
    } catch (error) {
      runtime.logger.error("Error in ANALYZE_WALLET action:", error);
      const errorMessage = (error as Error).message ?? "unknown error";
      const thought = `Action failed with error: ${errorMessage}. I should tell the user about the error.`;
      const text = `Failed to analyze wallet, reason: ${errorMessage}. Please try again.`;

      const responseContent = await rephrase({
        runtime,
        content: {
          text,
          thought,
          actions: ["ANALYZE_WALLET"],
          source: message.content.source,
        },
        state: composedState,
        prevActions,
      });

      await callback?.(responseContent);

      return {
        text: `Error analyzing wallet: ${errorMessage}.`,
        values: {
          success: false,
          responded: true,
          error: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: `${LEVVA_ACTIONS.ANALYZE_WALLET}`,
          error: errorMessage,
          thought,
        },
        success: false,
        error: error as Error,
      };
    }
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Please analyze my wallet",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Your portfolio value is worth {{total}}. Your tokens are {{tokens}}",
          action: "ANALYZE_WALLET",
        },
      },
    ],
  ],
};

export const suggest: Suggestion[] = [
  // Removed 4 filler suggestions that provided no value:
  // - portfolio-optimization → Use deposit-opportunities instead
  // - investment-opportunities → Use deposit-opportunities instead
  // - market-insights → Generic questions, no actionable insights
  // - send-tokens → Placeholder addresses, use send-intent instead
  //
  // Remaining actionable suggestions are defined in their respective action files:
  // - deposit-opportunities (in deposit.ts)
  // - position-diversification (in position.ts)
  // - position-management (in position.ts)
];
