import { isHex } from "viem";
import { Action } from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import { selectProviderState } from "../providers/util";
import type { LevvaService } from "../services/levva/class";
import { rephrase } from "../util/generate";
import { Suggestion } from "./types";
import { getPreviousReplyContext } from "../util/action-results";

export const action: Action = {
  name: LEVVA_ACTIONS.ANALYZE_WALLET,
  description: `Replies with wallet stats when user asks about his portfolio.`,
  similes: [
    "ANALYZE_WALLET",
    "ANALYZE_PORTFOLIO",
    "analyze wallet",
    "my assets",
    "my portfolio",
    "portfolio",
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

      const [assets, news, strategies] = await Promise.all([
        service.getWalletAssets({ chainId, address }),
        service.getCryptoNews(),
        service.getStrategies(chainId),
      ]);

      // Use enhanced rephrase utility instead of direct LLM call
      const portfolioSummary = service.formatWalletAssets(assets);
      const strategiesSummary = strategies
        .map(service.formatStrategy)
        .join("\n");
      const newsSummary = news.map((v) => v.description).join("\n");

      const content = {
        text: `Portfolio Analysis:\n\n${portfolioSummary}\n\nAvailable Strategies:\n${strategiesSummary}\n\nMarket News:\n${newsSummary}`,
        thought:
          "Analyzing user's portfolio, providing insights from news and suggesting strategies based on their holdings.",
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

export const suggest: Suggestion[] = [];
