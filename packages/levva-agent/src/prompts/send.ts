/**
 * Send/Transfer parameter extraction prompt
 *
 * @version 2.0.0
 * @lastModified 2025-01-29
 * @changes v2.0.0: Complete rewrite to Zod schema, added .regex() validation, balance-aware conversion
 * @changes v1.0.0: Initial implementation with DataDescription (deprecated)
 */

import { z } from "zod";
import { formatZodKeys, formatZodOutput } from "./util";

/** Zod schema for extracted send/transfer parameters from user messages */
export const extractedSendParamsSchema = z
  .object({
    thought: z
      .string()
      .describe(
        "Your analysis of the send request and parameter extraction. " +
          "Include reasoning about token identification, amount interpretation, recipient validation, and confidence factors."
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Confidence level in the extraction accuracy (0.0-1.0). " +
          "High (0.8-1.0): All parameters clear. Medium (0.5-0.79): Some inference needed. Low (0.0-0.49): Requires clarification."
      ),
    tokenSymbol: z
      .string()
      .nullable()
      .describe(
        "Token symbol to send (e.g., 'USDC', 'ETH', 'WETH'). " +
          "Extract the token the user wants to send from their wallet. " +
          "Return null if not specified."
      ),
    tokenAddress: z
      .string()
      .regex(
        /^0x[a-fA-F0-9]{40}$/,
        "Token address must be valid Ethereum address (0x + 40 hex chars)"
      )
      .nullable()
      .describe(
        "Token contract address if provided. " +
          "Must be valid Ethereum address format: 0x + 40 hex characters (42 total). " +
          "Example: 0xAf88d065e77c8cC2239327C5EDb3A432268e5831. " +
          "Return null if not specified or if using symbol instead."
      ),
    recipientAddress: z
      .string()
      .regex(
        /^0x[a-fA-F0-9]{40}$/,
        "Recipient must be valid Ethereum address (0x + 40 hex chars)"
      )
      .nullable()
      .describe(
        "Recipient wallet address (must be valid Ethereum address format: 0x + 40 hex characters). " +
          "Extract from phrases like 'send to 0x...', 'transfer to address', etc. " +
          "Return null if not specified. NEVER guess or assume addresses."
      ),
    amount: z
      .string()
      .regex(
        /^[0-9]+(\.[0-9]+)?$/,
        "Amount must be numeric string without symbols"
      )
      .nullable()
      .describe(
        'Numeric amount as string (e.g., "100", "0.5"). ' +
          "Use token decimal precision from provided balance data. " +
          'Convert percentages/keywords using balance: 50% → (0.5 × balance), "all"/"max" → full balance. ' +
          "NEVER include %, currency symbols, or token symbols."
      ),
  })
  .describe("Extracted send/transfer parameters from user message");

/** Extracted send parameters type inferred from Zod schema */
export type ExtractedSendParams = z.infer<typeof extractedSendParamsSchema>;

/**
 * @deprecated Legacy interface for backward compatibility. Use ExtractedSendParams instead.
 */
export interface ExtractedDataForSend {
  tokenSymbol?: string;
  tokenAddress?: `0x${string}`;
  recipientAddress?: `0x${string}`;
  amount?: string;
  confidence: number;
  thought: string;
}

export const extractSendDataFromMessagePrompt = (ctx: {
  inheritedData?: Record<string, any>;
  returnData?: Record<string, any>;
  messages?: string; // Conversation history for the current intent
  userPortfolio: string;
  availableTokens: string;
}) => {
  const currentMessage = ctx.messages?.split("\n").pop() || "";
  const inheritedContext = ctx.inheritedData
    ? `\n<inherited_context>
${JSON.stringify(ctx.inheritedData)}
</inherited_context>`
    : "";
  const returnDataContext = ctx.returnData
    ? `\n<return_data>
${JSON.stringify(ctx.returnData)}
</return_data>`
    : "";

  return `<task>
Extract token transfer parameters from user message for ERC20/ETH send transaction processing.
Consider user's available tokens and conversation context.
</task>
<message>
${currentMessage}
</message>
<conversation_history>
${ctx.messages || ""}
</conversation_history>
<user_portfolio>
${ctx.userPortfolio}
</user_portfolio>
<available_tokens>
${ctx.availableTokens}
</available_tokens>${inheritedContext}${returnDataContext}
<instructions>
Analyze the user message and conversation history to extract token transfer parameters.

CRITICAL SEND LOGIC:
- **Token Identification**:
  - Match token symbols (e.g., "USDC", "ETH", "WETH") from 'user_portfolio' or 'available_tokens'
  - Handle common aliases (e.g., "Ethereum" → "ETH", "USD Coin" → "USDC")
  - If token address is provided, validate it's a valid hex address
  - Prioritize tokens the user actually owns from 'user_portfolio'

- **Recipient Address**:
  - Extract Ethereum addresses (0x followed by 40 hex characters)
  - Validate address format (must be valid Ethereum address format)
  - Look for phrases like "send to", "transfer to", "to address"
  - NEVER guess or assume addresses - must be explicitly provided by user

- **Contextual Inference**:
  - Use 'conversation_history', 'inherited_context', and 'return_data' to complete missing parameters
  - If parameters were mentioned in previous messages within this intent, use them
  - Be careful not to assume parameters that weren't explicitly mentioned

AMOUNT PARSING RULES:
- Extract only numeric values: "100", "0.5", "1000"
- Percentage conversion: If user says "50%" AND token balance available in <user_portfolio> → compute 0.5 × balance
- Keyword conversion: If user says "all"/"max"/"everything" AND token balance available → use full token balance
- Format: Match token's decimal precision shown in user_portfolio balance data
- Trim trailing zeros (e.g., "15.460000" → "15.46")
- If token/balance unavailable: Return null for amount, explain reason in thought field
- NEVER include: %, $, currency symbols, token symbols, or keywords in the amount field

When converting percentages/keywords, use the exact decimal precision shown in the user_portfolio for that token.

EXTRACTION RULES:
- Return null for unclear or missing parameters
- Provide high confidence (0.8-1.0) only when all parameters are clearly specified
- If user mentions sending tokens but missing critical info, return lower confidence
- Always validate that the token exists in user's portfolio
- Ensure recipient address is properly formatted (0x + 40 hex chars)

SAFETY CHECKS:
- Never assume recipient addresses - they must be explicitly provided
- Don't guess token amounts - user must specify them
- Validate token symbol against user's actual holdings
- Flag suspicious patterns in thought field (sending all tokens, etc.)
</instructions>
<keys>
${formatZodKeys(extractedSendParamsSchema)}
</keys>
<output>
${formatZodOutput(extractedSendParamsSchema)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
