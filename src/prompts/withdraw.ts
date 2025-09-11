import { Memory } from "@elizaos/core";
import { DataDescription, formatKeys, formatOutput } from "./util";
import { UserPosition, WithdrawalRequest } from "../services/levva/positions";

/** Extracted withdrawal parameters from user messages */
export interface ExtractedDataForWithdraw {
  strategyId?: number;
  amount?: number | "all";
  withdrawalStep?: "request" | "check" | "claim";
  confidence?: number;
}

const dataDescription: DataDescription<ExtractedDataForWithdraw> = {
  strategyId: {
    type: "number",
    description:
      "The strategy number to withdraw from (e.g., 'strategy 1', 'from position 2')",
  },
  amount: {
    type: "number",
    description: "The amount to withdraw, or 'all' for full withdrawal",
  },
  withdrawalStep: {
    type: "string",
    description:
      "The withdrawal action: 'request' for new withdrawal, 'check' for status, 'claim' for finalized requests",
  },
  confidence: {
    type: "number",
    description: "Your confidence level in the extraction accuracy (0-100)",
    default: "0",
  },
};

export const extractWithdrawDataFromMessagePrompt = (ctx: {
  inheritedData?: Record<string, any>;
  returnData?: Record<string, any>;
  messages?: Memory[];
  positions?: UserPosition[];
  withdrawals?: WithdrawalRequest[];
}) => {
  const currentMessage =
    ctx.messages && ctx.messages.length > 0
      ? ctx.messages[ctx.messages.length - 1]?.content?.text || ""
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
</message>${positionsContext}${withdrawalsContext}${conversationContext}${inheritedContext}${returnDataContext}
<instructions>
Analyze the user message and extract withdrawal-related parameters using the provided context.

CRITICAL WITHDRAWAL LOGIC:
- If user wants to withdraw from a strategy that has an existing withdrawal request:
  * Check the "isFinalized" status in existing_withdrawals
  * If isFinalized = true: User can claim that withdrawal (set withdrawalStep to "claim", use existing requestId)
  * If isFinalized = false: User must wait or choose a different position (suggest alternatives)
- If no existing withdrawal for the chosen strategy: User can initiate new withdrawal (withdrawalStep = "request")

EXTRACTION RULES:
- If user mentions "all", "everything", "full", set amount to "all"
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
${formatKeys(dataDescription)}
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
