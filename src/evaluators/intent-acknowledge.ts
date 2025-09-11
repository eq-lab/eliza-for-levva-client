import {
  type IAgentRuntime,
  type Memory,
  type Evaluator,
  logger,
} from "@elizaos/core";
import { isHex, TransactionReceipt } from "viem";
import { IntentManager, IntentContext } from "../services/intent-manager";
import { LEVVA_SERVICE } from "../constants/enum";
import { onWithdrawSuccess } from "src/actions/intents/withdraw";
import { onSwapSuccess } from "src/actions/intents/swap";

interface TransactionData {
  type: string;
  hash: string;
  receipt: TransactionReceipt;
}

const isTransactionData = (obj: any): obj is TransactionData => {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.type === "string" &&
    typeof obj.hash === "string" &&
    isHex(obj.hash) &&
    obj.receipt &&
    typeof obj.receipt === "object" &&
    typeof obj.receipt.status === "string" &&
    typeof obj.receipt.transactionHash === "string" &&
    isHex(obj.receipt.transactionHash)
  );
};

const getTransactionReceipt = (content: string): TransactionData | null => {
  const match = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;

  const [, jsonString] = match;

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return null;
  }

  if (!isTransactionData(parsed)) return null;

  return parsed;
};

const isCancelRequest = (content: string): boolean => {
  const cancelKeywords = [
    "cancel",
    "stop",
    "abort",
    "nevermind",
    "never mind",
    "forget it",
    "don't do",
    "don't want",
    "changed my mind",
    "not anymore",
    "quit",
    "exit",
  ];

  const normalizedContent = content.toLowerCase().trim();

  return cancelKeywords.some((keyword) => normalizedContent.includes(keyword));
};

async function handleCancellation(
  runtime: IAgentRuntime,
  message: Memory,
  activeIntentContext: IntentContext
) {
  logger.info("Processing cancellation request for specific intent", {
    messageId: message.id,
    intentId: activeIntentContext.id,
    intentType: activeIntentContext.type,
    domain: activeIntentContext.domain,
  });

  try {
    const intentManager = runtime.getService<IntentManager>(
      LEVVA_SERVICE.INTENT_MANAGER
    );

    if (!intentManager) {
      logger.warn("IntentManager service not found");
      return;
    }

    // Cancel the specific active intent
    if (activeIntentContext.status === "ACTIVE") {
      await intentManager.cancelIntent(activeIntentContext);

      logger.info("Successfully cancelled active intent", {
        intentId: activeIntentContext.id,
        intentType: activeIntentContext.type,
        domain: activeIntentContext.domain,
      });
    } else {
      logger.warn("Intent is not in ACTIVE status", {
        intentId: activeIntentContext.id,
        status: activeIntentContext.status,
      });
    }
  } catch (error) {
    logger.error("Error handling cancellation:", error);
  }
}

async function handleTransactionConfirmation(
  runtime: IAgentRuntime,
  message: Memory,
  activeIntentContext: IntentContext
) {
  logger.info("Processing transaction confirmation for specific intent", {
    messageId: message.id,
    intentId: activeIntentContext.id,
    intentType: activeIntentContext.type,
    domain: activeIntentContext.domain,
  });

  try {
    const receipt = getTransactionReceipt(message.content.text || "")?.receipt;
    if (!receipt) {
      logger.debug("No valid transaction receipt found in message");
      return;
    }

    if (receipt.status !== "success") {
      logger.debug("Transaction failed");
      return;
    }

    switch (activeIntentContext.type) {
      case "WITHDRAW": {
        const shouldComplete = await onWithdrawSuccess(
          runtime,
          activeIntentContext,
          receipt
        );

        if (shouldComplete) {
          await handleIntentCompletion(
            runtime,
            message,
            receipt,
            activeIntentContext
          );
        }
        break;
      }
      case "SWAP": {
        const shouldComplete = await onSwapSuccess(
          runtime,
          activeIntentContext,
          receipt
        );

        if (shouldComplete) {
          await handleIntentCompletion(
            runtime,
            message,
            receipt,
            activeIntentContext
          );
        }
        break;
      }
      default:
        logger.warn("Unknown intent type for completion handling", {
          intentType: activeIntentContext.type,
          intentId: activeIntentContext.id,
        });
        // Complete the intent anyway to avoid stuck states
        await handleIntentCompletion(
          runtime,
          message,
          receipt,
          activeIntentContext
        );
        break;
    }
  } catch (error) {
    logger.error("Error handling transaction confirmation:", error);
  }
}

async function handleIntentCompletion(
  runtime: IAgentRuntime,
  message: Memory,
  receipt: TransactionReceipt,
  activeIntentContext: IntentContext
) {
  try {
    const intentManager = runtime.getService<IntentManager>(
      LEVVA_SERVICE.INTENT_MANAGER
    );

    if (!intentManager) {
      logger.debug("IntentManager service not found");
      return;
    }

    // Complete the specific active intent if it's transaction-related
    const transactionRelatedDomains = ["MANAGE_POSITIONS", "SWAP_TOKENS"];

    if (
      transactionRelatedDomains.includes(activeIntentContext.domain) &&
      activeIntentContext.status === "ACTIVE"
    ) {
      await intentManager.completeIntent(activeIntentContext);

      logger.info("Completed specific intent after transaction", {
        intentId: activeIntentContext.id,
        intentType: activeIntentContext.type,
        domain: activeIntentContext.domain,
        transactionHash: receipt.transactionHash,
      });
    } else {
      logger.debug("Intent is not transaction-related or not active", {
        domain: activeIntentContext.domain,
        status: activeIntentContext.status,
        transactionRelatedDomains,
      });
    }
  } catch (error) {
    logger.error("Error handling intent completion:", error);
  }
}

export const intentAcknowledgeEvaluator: Evaluator = {
  name: "INTENT_ACKNOWLEDGE",
  description:
    "Processes transaction confirmations and cancellation requests, updating cache and intent status accordingly",
  examples: [],
  alwaysRun: true,

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    if (!message.content?.text) {
      return false;
    }

    const content = message.content.text;
    const hasTxConfirmation = content.includes("Tx confirmation:");
    const hasCancelRequest = isCancelRequest(content);

    return hasTxConfirmation || hasCancelRequest;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state,
    options,
    callback
  ) => {
    const content = message.content.text || "";
    const isCancel = isCancelRequest(content);
    const hasTxConfirmation = content.includes("Tx confirmation:");

    logger.info("Processing intent acknowledgment", {
      messageId: message.id,
      isCancel,
      hasTxConfirmation,
      contentPreview: content.substring(0, 100),
    });

    try {
      // First, find active intents from recent conversation using IntentManager
      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      if (!intentManager) {
        logger.warn("IntentManager service not found");
        return;
      }

      const activeIntentContext =
        await intentManager.getActiveIntentByReply(message);

      if (!activeIntentContext) {
        logger.debug("No active intents found in conversation context");

        if (callback) {
          await callback({
            text: "No active intents found to acknowledge or cancel.",
            source: message.content.source,
          });
        }
        return;
      }

      logger.info("Found active intent context", {
        intentId: activeIntentContext.id,
        intentType: activeIntentContext.type,
        domain: activeIntentContext.domain,
      });

      // Handle cancellation requests
      if (isCancel) {
        await handleCancellation(runtime, message, activeIntentContext);
        return;
      } else if (hasTxConfirmation) {
        // Handle transaction confirmations
        await handleTransactionConfirmation(
          runtime,
          message,
          activeIntentContext
        );
        return;
      }

      throw new Error(
        "No valid intent acknowledgment found; check why validation failed"
      );
    } catch (error) {
      logger.error("Error processing intent acknowledgment:", error);
    }
  },
};
