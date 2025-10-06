import { formatUnits, isHex } from "viem";
import { Action, Memory } from "@elizaos/core";
import { INTENT_TYPE, LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
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
  keywords: ["send", "transfer", "pay", "move", "give", "donate"],
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
    const composedState = await runtime.composeState(message, [
      LEVVA_PROVIDER_NAME,
    ]);

    try {
      // Check for SEND intent first
      const intentManager = runtime.getService<IntentManager>("intent-manager");
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

        // If no active intent, try to detect one
        if (!intentContext) {
          const detectionResult = await intentManager.detectIntentWithLLM(
            message,
            LEVVA_ACTIONS.ANALYZE_WALLET
          );

          if (
            detectionResult.intentType === INTENT_TYPE.SEND &&
            detectionResult.confidence > 0.7
          ) {
            intentContext = await intentManager.createIntent({
              type: INTENT_TYPE.SEND,
              domain: LEVVA_ACTIONS.ANALYZE_WALLET,
              userId,
              channelId,
              metadata: { source: "wallet_action" },
            });

            if (intentContext) {
              await intentManager.addMemoryToIntent(intentContext, message);
            }
          }
        }

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
        (sum, asset) => sum + Number(asset.value) / 10 ** USD_DECIMALS,
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
        ...assets.map((a) => Number(a.value) / 10 ** USD_DECIMALS)
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
          actionName: LEVVA_ACTIONS.ANALYZE_WALLET,
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
          actionName: LEVVA_ACTIONS.ANALYZE_WALLET,
          error: errorMessage,
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
  {
    name: "portfolio-optimization",
    description:
      "Suggest portfolio optimization opportunities based on current holdings and risk analysis",
    getPrompt: async (runtime, key, message?: Memory) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) return "";

      const { address, chainId } = key;

      try {
        const [assets, positions, strategies] = await Promise.all([
          service.getWalletAssets({ chainId, address }),
          service.getUserPositions(address, chainId),
          service.strategy.getStrategies(chainId),
        ]);

        const totalValue = assets.reduce(
          (sum, asset) => sum + Number(asset.value) / 1e18,
          0
        );
        const activePositions = positions.filter((p) => p.balance > 0);
        const hasPositions = activePositions.length > 0;

        // ETH detection
        const ethAsset = assets.find(
          (asset) =>
            asset.token === ETH_NULL_ADDR || asset.address === ETH_NULL_ADDR
        );
        const hasEth = ethAsset ? ethAsset.amount > 0n : false;

        return `Generate portfolio optimization suggestions based on:

Portfolio Value: $${totalValue.toFixed(2)}
Active Positions: ${activePositions.length}
Available Assets: ${assets.length} tokens
${hasEth ? "Has ETH: Available for wrapping to WETH" : ""}
${hasPositions ? `Current Strategies: ${activePositions.map((p) => `Strategy ${p.strategyId}`).join(", ")}` : "No active positions"}

Suggest 3-4 optimization actions like:
- Diversification opportunities
- Risk rebalancing suggestions  
- New strategy recommendations
- ETH/WETH conversion opportunities
- Position management actions`;
      } catch (error) {
        runtime.logger.error(
          "Error in portfolio-optimization suggestion:",
          error
        );
        return "Suggest general portfolio optimization strategies";
      }
    },
  },
  {
    name: "investment-opportunities",
    description:
      "Highlight specific investment opportunities based on portfolio analysis",
    getPrompt: async (runtime, key, message?: Memory) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) return "";

      const { address, chainId } = key;

      try {
        const [assets, strategies] = await Promise.all([
          service.getWalletAssets({ chainId, address }),
          service.strategy.getStrategies(chainId),
        ]);

        const significantAssets = assets
          .filter((a) => a.value > 10) // Assets worth more than $10
          .slice(0, 3);

        const availableStrategies = strategies.slice(0, 5);

        return `Generate investment opportunity suggestions based on:

Significant Holdings: ${significantAssets.map((a) => `Token ${a.token} ($${(Number(a.value) / 1e18).toFixed(2)})`).join(", ")}
Available Strategies: ${availableStrategies.map((s) => `${(s.name && s.name.trim()) || `Strategy ${s.id}`} (${(s.risk && s.risk.trim()) || "Unknown Risk"})`).join(", ")}

Suggest specific investment actions like:
- "Deposit 50% of USDC into Ultra-Safe Strategy"
- "Explore Brave strategies for higher yields"
- "Wrap ETH and deposit into WETH strategy"
- "Start with $100 in Safe strategy"`;
      } catch (error) {
        runtime.logger.error(
          "Error in investment-opportunities suggestion:",
          error
        );
        return "Suggest general investment opportunities";
      }
    },
  },
  {
    name: "risk-assessment",
    description:
      "Provide risk analysis and recommendations for portfolio balance",
    getPrompt: async () => {
      return `Generate risk assessment suggestions focusing on:

- Portfolio concentration analysis
- Diversification recommendations
- Risk level balance (ultra-safe vs brave strategies)
- Asset allocation optimization
- Position sizing guidance

Provide actionable risk management suggestions.`;
    },
  },
  {
    name: "market-insights",
    description:
      "Share relevant market insights and news affecting user's portfolio",
    getPrompt: async (runtime) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) return "";

      try {
        const news = await service.getCryptoNews();
        const recentNews = news.slice(0, 3);

        return `Generate market insight suggestions based on recent news:

${recentNews.map((n) => `- ${n.description}`).join("\n")}

Suggest actions like:
- "How does this news affect my portfolio?"
- "Should I adjust my strategy based on market conditions?"
- "What opportunities does this create?"
- "How can I protect my portfolio from market volatility?"`;
      } catch (error) {
        runtime.logger.error("Error in market-insights suggestion:", error);
        return "Suggest general market analysis and portfolio protection strategies";
      }
    },
  },
  {
    name: "send-tokens",
    description:
      "Suggest token transfer and send operations based on available assets",
    getPrompt: async (runtime, key) => {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );
      if (!service) return "";

      const { address, chainId } = key;

      try {
        const assets = await service.getWalletAssets({ chainId, address });
        const significantAssets = assets
          .filter((a) => a.value > 1) // Assets worth more than $1
          .slice(0, 5);

        return `Generate token transfer suggestions based on available assets:

Available Tokens: ${significantAssets.map((a) => `Token ${a.token} ($${(Number(a.value) / 1e18).toFixed(2)})`).join(", ")}

Suggest transfer actions like:
- "Send 10 USDC to [address]"
- "Transfer 0.1 ETH to a friend"
- "Send half of my WETH to another wallet"
- "Pay someone with my tokens"
- "Move tokens to another address"

Include examples with specific amounts and emphasize the need for recipient addresses.`;
      } catch (error) {
        runtime.logger.error("Error in send-tokens suggestion:", error);
        return "Suggest general token transfer and send operations";
      }
    },
  },
];
