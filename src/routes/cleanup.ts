import { logger, type Route } from "@elizaos/core";
import { LEVVA_SERVICE } from "../constants/enum";
import { IntentManager } from "../services/intent-manager";
import { getLevvaUser } from "../util/db";
import {
  getRoomsByChannelId,
  deleteMemoriesByRoomId,
} from "../services/levva/messages";

/**
 * Cleanup route for canceling active intents and clearing caches in a channel
 * Should be called before clearing channel messages to clean up intent state and caches
 */
const route: Route = {
  path: "/cleanup",
  type: "GET",
  handler: async (req, res, runtime) => {
    try {
      const { channelId, userId } = req.query;

      if (!channelId) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_CHANNEL_ID",
            message: "channelId is required",
          },
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_USER_ID",
            message: "userId is required",
          },
        });
      }

      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      if (!intentManager) {
        logger.warn("IntentManager service not found");
        return res.status(500).json({
          success: false,
          error: {
            code: "SERVICE_NOT_FOUND",
            message: "IntentManager service not available",
          },
        });
      }

      const cleanupStats = {
        cancelledIntents: 0,
        clearedSuggestions: false,
        clearedLoadingState: false,
        clearedMemories: 0,
      };

      // 1. Clear all memories (including messages) for rooms in this channel
      // IMPORTANT: In ElizaOS, messages are stored as memories with tableName='messages'
      // The recentMessages provider reads from runtime.getMemories({ tableName: 'messages' })
      // So deleting all memories will also clear the conversation history
      try {
        // First, get all rooms for this channel
        const rooms = await getRoomsByChannelId(runtime, channelId);

        if (rooms && rooms.length > 0) {
          logger.info(
            `[CLEANUP] Found ${rooms.length} room(s) for channel ${channelId}`
          );

          // Delete ALL memories for each room (this includes messages with tableName='messages')
          for (const room of rooms) {
            const deletedCount = await deleteMemoriesByRoomId(runtime, room.id);
            cleanupStats.clearedMemories += deletedCount;
          }

          logger.info(
            `[CLEANUP] Deleted ${cleanupStats.clearedMemories} memories (including messages) from ${rooms.length} room(s)`
          );
        } else {
          logger.info(`[CLEANUP] No rooms found for channel ${channelId}`);
        }
      } catch (error) {
        logger.warn(
          "[CLEANUP] Could not clear memories:",
          error instanceof Error ? error.message : String(error)
        );
      }

      // 2. Cancel all active intents for this user+channel across all domains
      // Get all registered domains (using static method)
      const allDomains = Array.from(
        IntentManager.getRegisteredIntents().values()
      )
        .map((registration) => registration.domain)
        .filter((domain, index, self) => self.indexOf(domain) === index); // Unique domains

      logger.info(
        `[CLEANUP] Checking ${allDomains.length} domain(s) for active intents`
      );

      // First, cancel intents for the current user
      for (const domain of allDomains) {
        try {
          const intent = await intentManager.getActiveIntentByDomain(
            userId,
            channelId,
            domain
          );

          if (intent) {
            await intentManager.cancelIntent(intent);
            cleanupStats.cancelledIntents++;
            logger.info(
              `[CLEANUP] Cancelled ${intent.type} intent (ID: ${intent.id}) in ${domain} domain for user ${userId}`
            );
          }
        } catch (error) {
          logger.warn(
            `[CLEANUP] Error cancelling intent in ${domain}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      // Second, clean up any orphaned intents in this channel (different userIds)
      try {
        const orphanedIntents =
          await intentManager.getAllActiveIntentsInChannel(channelId);

        if (orphanedIntents.length > 0) {
          logger.info(
            `[CLEANUP] Found ${orphanedIntents.length} orphaned intent(s) in channel`
          );

          for (const intent of orphanedIntents) {
            if (intent.userId !== userId) {
              // Only cancel if it's not the current user's intent (already handled above)
              await intentManager.cancelIntent(intent);
              cleanupStats.cancelledIntents++;
              logger.info(
                `[CLEANUP] Cancelled orphaned ${intent.type} intent (ID: ${intent.id}) with userId: ${intent.userId}`
              );
            }
          }
        }
      } catch (error) {
        logger.warn(
          "[CLEANUP] Error cleaning up orphaned intents:",
          error instanceof Error ? error.message : String(error)
        );
      }

      // 3. Clear suggestions cache for all supported chains (chainId agnostic)
      try {
        const user = (
          await getLevvaUser(runtime, {
            id: userId as `${string}-${string}-${string}-${string}-${string}`,
          })
        )[0];

        if (user) {
          const supportedChainIds = [1, 8453, 42161]; // Mainnet, Base, Arbitrum

          for (const chainId of supportedChainIds) {
            const suggestionsKey = `suggestions:${user.address}:${chainId}`;
            await runtime.deleteCache(suggestionsKey);

            // Clear loading state
            const loadingKey = `suggestions_loading:${user.address}:${chainId}`;
            // @ts-expect-error - stateCache exists on runtime but not in interface
            if (runtime.stateCache) {
              // @ts-expect-error
              runtime.stateCache.delete(loadingKey);
            }
          }

          cleanupStats.clearedSuggestions = true;
          cleanupStats.clearedLoadingState = true;

          logger.info(
            `[CLEANUP] Cleared suggestions cache for user ${userId} across all chains`
          );
        }
      } catch (error) {
        logger.warn(
          "[CLEANUP] Could not clear suggestions cache:",
          error instanceof Error ? error.message : String(error)
        );
      }

      logger.info(
        `[CLEANUP] Channel ${channelId} cleanup complete`,
        JSON.stringify(cleanupStats)
      );

      return res.status(200).json({
        success: true,
        data: {
          channelId,
          ...cleanupStats,
          message: `Cleaned up channel: ${cleanupStats.cancelledIntents} intent(s) cancelled, ${cleanupStats.clearedMemories} memor(ies) deleted (including conversation history)`,
        },
      });
    } catch (error) {
      logger.error(
        "Error in cleanup route",
        error instanceof Error ? error.message : String(error)
      );
      return res.status(500).json({
        success: false,
        error: {
          code: "CLEANUP_ERROR",
          message:
            error instanceof Error ? error.message : "Unknown cleanup error",
        },
      });
    }
  },
};

export default route;
