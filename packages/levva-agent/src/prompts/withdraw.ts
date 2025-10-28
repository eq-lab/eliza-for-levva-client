/**
 * Withdrawal parameter extraction prompt
 *
 * @version 1.2.0
 * @lastModified 2025-01-28
 * @changes v1.2.0: Converted to Zod schema for structured output (follows @structured-output-patterns.mdc)
 * @changes v1.1.0: Standardized amount field to string type (was number | "all")
 * @changes v1.0.0: Initial implementation with request/check/claim flow
 */

import { z } from "zod";
import { Memory } from "@elizaos/core";
import { formatZodKeys, formatZodOutput } from "./util";
import { UserPosition, WithdrawalRequest } from "../services/levva/positions";

/** Zod schema for extracted withdrawal parameters from user messages */
export const extractedDataForWithdrawSchema = z
  .object({
    thought: z
      .string()
      .describe(
        "Your analysis of the user's withdrawal request and parameter extraction. " +
          "Include reasoning about strategy identification, amount interpretation, and confidence factors."
      ),
    confidence: z
      .number()
      .min(0)
      .max(100)
      .describe(
        "Your confidence level in the extraction accuracy (0-100). " +
          "High (80-100): All parameters clear. Medium (50-79): Some inference needed. Low (0-49): Requires clarification."
      ),
    strategyId: z
      .number()
      .optional()
      .describe(
        "The numeric strategy ID to withdraw from (e.g., 1, 2, 3). " +
          "Extract when user mentions 'strategy 1', 'from position 2', or references a specific strategy number."
      ),
    strategyName: z
      .string()
      .optional()
      .describe(
        "Strategy name to withdraw from if specified (e.g., 'Brave Strategy', 'Ultra-Safe USDC Vault'). " +
          "Extract when user mentions the strategy by name rather than number."
      ),
    strategyRisk: z
      .string()
      .optional()
      .describe(
        'Strategy risk profile: "ultra-safe", "safe", "brave", or "custom". ' +
          "Extract when user mentions risk level (e.g., 'withdraw from safe strategy', 'my ultra-safe position')."
      ),
    amount: z
      .string()
      .optional()
      .describe(
        'Numeric amount as string (e.g., "100", "0.5") or "all" for full withdrawal. ' +
          "Must match regex ^([0-9]+(\\.[0-9]+)?|all)$ when present. " +
          'Examples: "100" (NOT "100 USDC"), "0.5" (NOT "0.5 tokens"), "all" (for full withdrawal).'
      ),
    withdrawalStep: z
      .enum(["request", "check", "claim"])
      .optional()
      .describe(
        "The withdrawal action type: " +
          "'request' for initiating new withdrawal, " +
          "'check' for checking withdrawal status, " +
          "'claim' for claiming finalized withdrawals. " +
          "Extract 'claim' when user mentions 'claim' or references a ready withdrawal. " +
          "Extract 'check' when user asks about status. " +
          "Extract 'request' when user mentions amounts or withdrawing."
      ),
  })
  .describe("Extracted withdrawal parameters from user message");

/** Extracted withdrawal parameters type inferred from Zod schema */
export type ExtractedDataForWithdraw = z.infer<
  typeof extractedDataForWithdrawSchema
>;

export const extractWithdrawDataFromMessagePrompt = (ctx: {
  inheritedData?: Record<string, any>;
  returnData?: Record<string, any>;
  messages?: Memory[];
  positions?: UserPosition[];
  withdrawals?: WithdrawalRequest[];
  strategyIdMap?: Record<number, string>;
}) => {
  const currentMessage =
    ctx.messages && ctx.messages.length > 0
      ? ctx.messages[ctx.messages.length - 1]?.content?.text || ""
      : "";

  const strategyContext =
    ctx.strategyIdMap && Object.keys(ctx.strategyIdMap).length > 0
      ? `\n<strategy_context>
Available strategies:
${Object.values(ctx.strategyIdMap).join("\n")}
</strategy_context>`
      : "";

  // Build context about user's positions
  const positionsContext =
    ctx.positions && ctx.positions.length > 0
      ? `\n<user_positions>
Available positions:
${ctx.positions
  .map(
    (p) =>
      `- Strategy ${p.strategyId}: ${p.balance} tokens ($${p.balanceUsd.toFixed(2)}) ${p.hasPendingWithdrawals ? "[Has pending withdrawal]" : ""}`
  )
  .join("\n")}
</user_positions>`
      : "\n<user_positions>No active positions found.</user_positions>";

  // Build context about existing withdrawals
  const withdrawalsContext =
    ctx.withdrawals && ctx.withdrawals.length > 0
      ? `\n<existing_withdrawals>
Current withdrawal requests:
${ctx.withdrawals
  .map(
    (w) =>
      `- Request #${w.requestId} (Strategy ${w.strategyId}): ${w.amount} tokens - ${w.isFinalized ? "✅ READY TO CLAIM" : "⏳ Processing"}`
  )
  .join("\n")}
</existing_withdrawals>`
      : "\n<existing_withdrawals>No existing withdrawal requests.</existing_withdrawals>";

  // Build conversation context
  const conversationContext =
    ctx.messages && ctx.messages.length > 1
      ? `\n<conversation_history>
Recent messages:
${ctx.messages
  .slice(-3)
  .map((m, i) => `${i + 1}. ${m.content?.text || "No text"}`)
  .join("\n")}
</conversation_history>`
      : "";

  // Build inherited context
  const inheritedContext = ctx.inheritedData
    ? `\n<inherited_context>
Previous context: ${JSON.stringify(ctx.inheritedData)}
</inherited_context>`
    : "";

  // Build return data context
  const returnDataContext = ctx.returnData
    ? `\n<return_data>
Current extracted data: ${JSON.stringify(ctx.returnData)}
</return_data>`
    : "";

  return `<task>
Extract withdrawal parameters from user message for transaction processing.
Consider the user's current positions, existing withdrawals, and conversation context.
</task>
<message>
${currentMessage}
</message>${strategyContext}${positionsContext}${withdrawalsContext}${conversationContext}${inheritedContext}${returnDataContext}
<instructions>
Analyze the user message and extract withdrawal-related parameters using the provided context.

CRITICAL WITHDRAWAL LOGIC:
- **Strategy Detection**: Extract strategy by name, risk level ("ultra-safe", "safe", "brave"), or ID using available strategies mapping
- If user wants to withdraw from a strategy that has an existing withdrawal request:
  * Check the "isFinalized" status in existing_withdrawals
  * If isFinalized = true: User can claim that withdrawal (set withdrawalStep to "claim", use existing requestId)
  * If isFinalized = false: User must wait or choose a different position (suggest alternatives)
- If no existing withdrawal for the chosen strategy: User can initiate new withdrawal (withdrawalStep = "request")

EXTRACTION RULES:
- **Amount Format**: Always return amount as a string (e.g., "100", "0.5", "all")
  - If user mentions "all", "everything", "full", set amount to "all"
  - If user mentions numeric amounts, return as string (e.g., "50" not 50)
  - Strip currency/token symbols (e.g., "100 USDC" → "100")
- If user mentions "claim" or "ready" with ID, set withdrawalStep to "claim"
- If user mentions "status" or "check", set withdrawalStep to "check"  
- If user mentions amount or "withdraw", set withdrawalStep to "request"
- Use position context to infer strategyId if user says "from my position" or similar
- Use existing withdrawal context to determine if claim is possible
- Return null for unclear or missing parameters
- Provide confidence level based on clarity of the message and available context

CONTEXT USAGE:
- Reference user_positions to validate strategy availability
- Reference existing_withdrawals to check finalization status
- Use conversation_history for context clues
- Consider inherited_context and return_data for ongoing conversations
</instructions>
<keys>
${formatZodKeys(extractedDataForWithdrawSchema)}
</keys>
<output>
${formatZodOutput(extractedDataForWithdrawSchema)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
