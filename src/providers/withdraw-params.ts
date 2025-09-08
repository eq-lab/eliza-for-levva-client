import {
  IAgentRuntime,
  Memory,
  Provider,
  State,
  ModelType,
} from "@elizaos/core";
import { isHex } from "viem";
import {
  extractWithdrawDataFromMessagePrompt,
  ExtractedDataForWithdraw,
} from "../prompts/withdraw";

export const WITHDRAW_PARAMS_PROVIDER_NAME = "WITHDRAW_PARAMS";

interface WithdrawParams {
  userAddress?: `0x${string}`;
  strategyId?: number;
  amount?: number;
  withdrawalStep?: "request" | "check" | "claim";
  requestId?: number;
}

// Use the extracted data interface from prompts
type LLMExtractedParams = ExtractedDataForWithdraw & {
  confidence: number;
};

export const withdrawParamsProvider: Provider = {
  name: WITHDRAW_PARAMS_PROVIDER_NAME,
  description: "Extracts withdrawal parameters from user messages using LLM",
  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    const text = message.content?.text || "";

    // Extract user address from message metadata or state
    const userAddress = ((message.metadata as any)?.userAddressId ||
      (state as any)?.userAddress) as `0x${string}` | undefined;

    if (!userAddress || !isHex(userAddress)) {
      return {
        text: "Invalid or missing user address for withdrawal",
        data: {},
      };
    }

    // Check cache first to prevent redundant LLM calls during composition
    const cacheKey = `withdraw-params-${message.id}`;
    let extractedParams = await runtime.getCache<LLMExtractedParams>(cacheKey);

    if (!extractedParams) {
      try {
        // Use LLM to extract parameters with consistent prompt format
        const prompt = extractWithdrawDataFromMessagePrompt({ message: text });

        const response = await runtime.useModel(ModelType.OBJECT_SMALL, prompt);

        // Parse LLM response - OBJECT_SMALL should return structured JSON
        if (typeof response === "object" && response !== null) {
          extractedParams = {
            ...(response as ExtractedDataForWithdraw),
            confidence: (response as any).confidence || 0,
          };
        } else {
          // Fallback parsing if response is still a string
          const cleanResponse = response.toString().trim();
          const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);

          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as ExtractedDataForWithdraw;
            extractedParams = {
              ...parsed,
              confidence: parsed.confidence || 0,
            };
          } else {
            runtime.logger.warn(
              "Failed to parse LLM response for withdraw params"
            );
            extractedParams = { confidence: 0 };
          }
        }

        // Cache the result to prevent redundant calls
        await runtime.setCache(cacheKey, extractedParams); // 5 minutes TTL

        runtime.logger.debug(
          `LLM extracted withdraw params: ${JSON.stringify(extractedParams)}`
        );
      } catch (error) {
        runtime.logger.error(
          "Error extracting withdraw params with LLM:",
          error
        );

        // Fallback to regex-based extraction
        extractedParams = await fallbackRegexExtraction(text);
        await runtime.setCache(cacheKey, extractedParams);
      }
    }

    // Build final parameters
    const params: WithdrawParams = {
      userAddress,
    };

    // Apply extracted parameters with validation
    if (extractedParams.strategyId && extractedParams.strategyId > 0) {
      params.strategyId = extractedParams.strategyId;
    }

    if (
      extractedParams.amount !== undefined &&
      extractedParams.amount !== null
    ) {
      if (extractedParams.amount === "all") {
        params.amount = -1; // Special value indicating "all"
      } else if (
        typeof extractedParams.amount === "number" &&
        extractedParams.amount > 0
      ) {
        params.amount = extractedParams.amount;
      }
    }

    if (extractedParams.withdrawalStep) {
      params.withdrawalStep = extractedParams.withdrawalStep;
    }

    if (extractedParams.requestId && extractedParams.requestId > 0) {
      params.requestId = extractedParams.requestId;
    }

    // Log extraction results for debugging
    runtime.logger.debug(
      `Withdraw params extracted (confidence: ${extractedParams.confidence}%): ${JSON.stringify(params)}`
    );

    return {
      text: `Extracted withdrawal parameters: ${JSON.stringify(params)}`,
      data: params,
    };
  },
};

/**
 * Fallback regex-based parameter extraction when LLM fails
 */
async function fallbackRegexExtraction(
  text: string
): Promise<LLMExtractedParams> {
  const lowerText = text.toLowerCase();
  const params: LLMExtractedParams = { confidence: 50 }; // Lower confidence for regex

  // Extract strategy ID
  const strategyMatch =
    lowerText.match(/strategy\s*(\d+)/i) ||
    lowerText.match(/from\s*(\d+)/) ||
    lowerText.match(/position\s*(\d+)/);
  if (strategyMatch) {
    params.strategyId = parseInt(strategyMatch[1]);
  }

  // Extract amount
  const amountMatch = lowerText.match(
    /(\d+(?:\.\d+)?)\s*(?:usdc|eth|weth|tokens?)?/i
  );
  if (amountMatch) {
    params.amount = parseFloat(amountMatch[1]);
  }

  // Check for "all" or "everything" keywords
  if (
    lowerText.includes("all") ||
    lowerText.includes("everything") ||
    lowerText.includes("full")
  ) {
    params.amount = "all";
  }

  // Extract request ID for claim operations
  const requestIdMatch =
    lowerText.match(/request\s*#?(\d+)/i) || lowerText.match(/id\s*(\d+)/i);
  if (requestIdMatch) {
    params.requestId = parseInt(requestIdMatch[1]);
  }

  // Determine withdrawal step based on keywords
  if (
    lowerText.includes("claim") ||
    (lowerText.includes("ready") && params.requestId)
  ) {
    params.withdrawalStep = "claim";
  } else if (lowerText.includes("status") || lowerText.includes("check")) {
    params.withdrawalStep = "check";
  } else if (
    lowerText.includes("request") ||
    lowerText.includes("initiate") ||
    params.amount
  ) {
    params.withdrawalStep = "request";
  }

  return params;
}
