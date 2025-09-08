import { DataDescription, formatKeys, formatOutput } from "./util";

/** Extracted withdrawal parameters from user messages */
export interface ExtractedDataForWithdraw {
  strategyId?: number;
  amount?: number | "all";
  withdrawalStep?: "request" | "check" | "claim";
  requestId?: number;
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
  requestId: {
    type: "number",
    description:
      "The withdrawal request ID for claiming (e.g., 'request #123')",
  },
  confidence: {
    type: "number",
    description: "Your confidence level in the extraction accuracy (0-100)",
    default: "0",
  },
};

export const extractWithdrawDataFromMessagePrompt = (ctx: {
  message: string;
}) => `<task>
Extract withdrawal parameters from user message for transaction processing.
</task>
<message>
${ctx.message}
</message>
<instructions>
Analyze the user message and extract withdrawal-related parameters.
Only extract clear, explicit information from the message.
Use the following rules for extraction:
- If user mentions "all", "everything", "full", set amount to "all"
- If user mentions "claim" or "ready" with ID, set withdrawalStep to "claim"
- If user mentions "status" or "check", set withdrawalStep to "check"  
- If user mentions amount or "withdraw", set withdrawalStep to "request"
- Return null for unclear or missing parameters
- Provide confidence level based on clarity of the message
</instructions>
<keys>
${formatKeys(dataDescription)}
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
</output>`;
