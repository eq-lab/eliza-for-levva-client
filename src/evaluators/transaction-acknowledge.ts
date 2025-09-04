import {
  type IAgentRuntime,
  type Memory,
  type Evaluator,
  logger,
} from "@elizaos/core";
import { isHex, getAddress } from "viem";
import { and, eq } from "drizzle-orm";
import { getLevvaUser, getDb } from "../util/db";
import { balancesTable } from "../schema/balances";
import { hasRawMetadata } from "./utils";

interface TransactionData {
  type: string;
  hash: string;
  receipt: {
    status: string;
    transactionHash: string;
    blockHash?: string;
    gasUsed?: string | number;
    to?: string;
    from?: string;
    [key: string]: any;
  };
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

export const transactionAcknowledgeEvaluator: Evaluator = {
  name: "TRANSACTION_ACKNOWLEDGE",
  description: "Processes transaction confirmations and updates cache",
  examples: [],
  alwaysRun: true,

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    if (!message.content?.text) {
      return false;
    }

    const content = message.content.text;
    const hasTxConfirmation = content.includes("Tx confirmation:");
    return hasTxConfirmation;
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    logger.info("Processing transaction acknowledgment", {
      messageId: message.id,
      contentPreview: message.content.text,
    });

    try {
      const receipt = getTransactionReceipt(message.content.text || "");
      if (!receipt) {
        logger.debug("No valid transaction receipt found in message");
        return;
      }

      if (receipt.receipt.status !== "success") {
        logger.debug("Transaction failed");
        return;
      }

      if (!hasRawMetadata(message.metadata)) {
        return;
      }

      const rawMessage = message.metadata.raw;
      const userAddressId = rawMessage?.metadata?.userAddressId;
      const chainId = rawMessage?.metadata?.chainId;

      if (!userAddressId || typeof chainId !== "number") {
        logger.debug("No user address id or chain id found");
        return;
      }

      const user = (
        await getLevvaUser(runtime, {
          id: userAddressId as `${string}-${string}-${string}-${string}-${string}`,
        })
      )[0];

      if (!user) {
        logger.warn("User not found for transaction acknowledgment", {
          userAddressId,
        });
        return;
      }

      try {
        const db = getDb(runtime);
        await db
          .delete(balancesTable)
          .where(
            and(
              eq(balancesTable.address, getAddress(user.address)),
              eq(balancesTable.chainId, chainId)
            )
          );
        logger.info("Deleted user balances from DB");
      } catch (error) {
        logger.error("Failed to delete user balances from DB", error);
      }
    } catch (error) {
      logger.error("Error processing transaction acknowledgment:", error);
    }
  },
};
