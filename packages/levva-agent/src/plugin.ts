import { EventType, logger, type Plugin } from "@elizaos/core";
/** @ts-ignore type error in plugin-bootstrap src */
import { CancelRunSignal } from "@elizaos/plugin-bootstrap";
import { z } from "zod";
import { modules } from "./actions/modules";
import { levvaProvider } from "./providers";
import { newsProvider } from "./providers/news";
import { swapParamsProvider } from "./providers/swap-params";
import { strategyParamsProvider } from "./providers/strategy-params";
import { positionParamsProvider } from "./providers/position-params";
import { suggestionsEvaluator } from "./evaluators/suggestions";
import { intentAcknowledgeEvaluator } from "./evaluators/intent-acknowledge";
import statusRoute from "./routes/status";
import calldataRoute from "./routes/calldata";
import chanRoute from "./routes/chan";
import levvaUserRoute from "./routes/levva-user";
import suggestRoute from "./routes/suggest";
import clearSuggestRoute from "./routes/clear-suggest";
import cleanupRoute from "./routes/cleanup";
import { BrowserService } from "./services/browser";
import { LevvaService } from "./services/levva/class";
import { IntentManager } from "./services/intent-manager";
import { MessageRateLimiter } from "./services/message-rate-limiter";
import { LEVVA_SERVICE } from "./constants/enum";

/**
 * Define the configuration schema for the plugin with the following properties:
 *
 * @param {string} KYBER_CLIENT_ID - Kyberswap client id
 * @returns {object} - The configured schema object
 */
const configSchema = z.object({
  KYBER_CLIENT_ID: z
    .string()
    .min(1, "Kyberswap client id is not provided")
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn("Warning: Kyberswap client id is not provided");
      }

      return val;
    }),
});

const plugin: Plugin = {
  name: "levva",
  description:
    "Advanced DeFi portfolio management and investment assistant powered by the Levva protocol. Provides intelligent, context-aware investment strategies with multi-step intent-based actions for seamless user experiences. Core capabilities include: comprehensive portfolio analysis and optimization, automated deposit/withdrawal management with risk assessment, cross-chain token swapping via Kyber and Pendle with ETH/WETH conversion, personalized strategy recommendations (ultra-safe to brave risk profiles), real-time market intelligence and news aggregation, persistent transaction flows with smart parameter extraction, and multi-chain support across Ethereum, Arbitrum, and Base. Features advanced intent system for complex operations, yield farming optimization, leverage management, and transaction calldata generation for institutional-grade DeFi operations.",
  priority: -1,
  dependencies: ["bootstrap"], // ensure that bootstrap is loaded first
  config: {
    KYBER_CLIENT_ID: process.env.KYBER_CLIENT_ID,
  },
  async init(config: Record<string, string>) {
    logger.info("*** Initializing levva plugin ***");
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(", ")}`
        );
      }
      throw error;
    }
  },
  routes: [
    calldataRoute,
    chanRoute,
    cleanupRoute,
    clearSuggestRoute,
    levvaUserRoute,
    suggestRoute,
    statusRoute,
  ],
  events: {
    [EventType.RUN_STARTED]: [
      async ({ runtime, runId, entityId }) => {
        const service = runtime.getService<LevvaService>(
          LevvaService.serviceType
        );

        if (!service) {
          logger.warn("LevvaService not found");
          return;
        }

        const { result, reason } = await service.checkEligibility(
          await runtime.getEntityById(entityId)
        );

        if (!result) {
          logger.warn(
            "Entity is not eligible (ETH balance)",
            JSON.stringify({
              runId,
              entityId,
              reason,
            })
          );
          const signal = CancelRunSignal.getSignal(runId);
          signal.cancel(reason);
          return;
        }

        const rateLimiter = runtime.getService<MessageRateLimiter>(
          LEVVA_SERVICE.MESSAGE_RATE_LIMITER
        );

        if (!rateLimiter) {
          logger.warn("MessageRateLimiter service not found");
          return;
        }

        const rateLimitCheck = await rateLimiter.checkMessageLimit(entityId);

        if (!rateLimitCheck.result) {
          const signal = CancelRunSignal.getSignal(runId);
          signal.cancel(rateLimitCheck.reason);
          return;
        }
      },
    ],
  },
  services: [BrowserService, LevvaService, IntentManager, MessageRateLimiter],
  actions: modules.map((m) => m.action),
  providers: [
    levvaProvider,
    newsProvider,
    swapParamsProvider,
    strategyParamsProvider,
    positionParamsProvider,
  ],
  evaluators: [suggestionsEvaluator, intentAcknowledgeEvaluator],
};

export default plugin;
