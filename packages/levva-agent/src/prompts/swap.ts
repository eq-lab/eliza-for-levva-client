/**
 * Swap parameter extraction prompt
 *
 * @version 1.2.0
 * @lastModified 2025-01-29
 * @changes v1.2.0: Added .regex() validation for amount, balance-aware conversion
 * @changes v1.1.0: Converted to Zod schema for structured output (follows @structured-output-patterns.mdc)
 * @changes v1.0.1: Added intent context support for improved extraction
 * @changes v1.0.0: Initial implementation
 */

import { z } from "zod";
import { formatZodKeys, formatZodOutput } from "./util";

/** Zod schema for extracted swap parameters from user messages */
export const extractedSwapParamsSchema = z
  .object({
    thought: z
      .string()
      .describe(
        "Your analysis of the swap request and parameter extraction. " +
          "Include reasoning about token identification, amount interpretation, and any ambiguities resolved using context."
      ),
    fromToken: z
      .string()
      .nullable()
      .describe(
        "Token symbol (e.g., 'USDC', 'ETH') or contract address to swap FROM. " +
          "Extract the source token the user wants to swap. " +
          "If symbol: 'USDC', 'WETH', 'ETH'. " +
          "If address: Must be valid Ethereum address format (0x + 40 hex characters, 42 total). " +
          "Example address: 0xAf88d065e77c8cC2239327C5EDb3A432268e5831. " +
          "Return null if not specified."
      ),
    toToken: z
      .string()
      .nullable()
      .describe(
        "Token symbol (e.g., 'WETH', 'DAI') or contract address to swap TO. " +
          "Extract the destination token the user wants to receive. " +
          "If symbol: 'WETH', 'DAI', 'USDC'. " +
          "If address: Must be valid Ethereum address format (0x + 40 hex characters, 42 total). " +
          "Example address: 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1. " +
          "Return null if not specified."
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
          "Convert percentages/keywords using balance: " +
          '50% → (0.5 × balance), "all"/"max" → full balance. ' +
          "NEVER include %, currency symbols, or token symbols."
      ),
  })
  .describe("Extracted swap parameters from user messages");

/** Extracted swap parameters type inferred from Zod schema */
export type ExtractedSwapParams = z.infer<typeof extractedSwapParamsSchema>;

export const selectSwapDataFromMessagesPrompt = (ctx: {
  recentMessages: string;
  tokens: string;
  userPortfolio?: string; // User's actual holdings (all tokens with non-zero balances)
  intentContext?: {
    type: string;
    returnData?: Record<string, any>;
    memories?: string;
  };
}) => `<task>
Extract swap transaction parameters from recent messages${ctx.intentContext ? " using intent context for improved accuracy" : ""}.
</task>
<knownTokens>
Available tokens for swapping:
${ctx.tokens}
</knownTokens>
${
  ctx.userPortfolio
    ? `<userPortfolio>
User's wallet holdings (non-zero balances):
${ctx.userPortfolio}
</userPortfolio>`
    : ""
}
<recentMessages>
${ctx.recentMessages}
</recentMessages>
${
  ctx.intentContext
    ? `<intentContext>
Intent Type: ${ctx.intentContext.type}
${ctx.intentContext.returnData && Object.keys(ctx.intentContext.returnData).length > 0 ? `Previous Data: ${JSON.stringify(ctx.intentContext.returnData, null, 2)}` : ""}
${
  ctx.intentContext.memories
    ? `Intent Conversation History:
${ctx.intentContext.memories}`
    : ""
}
</intentContext>`
    : ""
}

<instructions>
${
  ctx.intentContext
    ? `
PRIORITY INSTRUCTIONS for Intent-Based Extraction:
1. If this is part of an ongoing SWAP intent, prioritize information from intentContext
2. Use returnData from previous intent interactions to fill missing parameters
3. Consider the full conversation history within this intent for context
4. If parameters were partially specified in previous messages within this intent, complete them
5. RETRY HANDLING: If user says "retry", "try again", "please retry", or similar, and there are complete swap parameters in returnData, use those exact parameters
6. CONTINUATION: If user provides minimal input like "yes", "ok", "proceed", "continue" and there are complete parameters in returnData, use those parameters

GENERAL INSTRUCTIONS:
`
    : ""
}
- Ignore messages for transactions that are either canceled or confirmed
- Choose token symbol from known token symbols if ambiguous
- Extract the following information for the swap transaction:
  * Token symbol or address to swap FROM (source token)
  * Token symbol or address to swap TO (destination token)  
  * Amount of tokens to swap (denominated in the FROM token)
- If multiple swap requests exist, extract parameters for the MOST RECENT uncompleted swap
- Handle common token aliases (e.g., "ETH" = "WETH" for wrapped operations)
${ctx.intentContext ? '- Leverage intent context to resolve ambiguous references (e.g., "that token" referring to previously mentioned tokens)' : ""}

AMOUNT PARSING RULES:
- Extract only numeric values: "100", "0.5", "1000"
- Use <userPortfolio> to see user's actual holdings with balances and decimals
- Percentage conversion: If user says "50%" → look up token in <userPortfolio>, compute 0.5 × balance
- Keyword conversion: If user says "all"/"max" → look up token in <userPortfolio>, use full balance
- Format: Match token's decimal precision shown in <userPortfolio> data
- Trim trailing zeros (e.g., "15.460000" → "15.46")
- If token not in portfolio or balance unavailable: Return null for amount, explain reason in thought field
- NEVER include: %, $, currency symbols, or token symbols in the amount field

TOKEN SELECTION GUIDANCE:
- If user doesn't specify fromToken, check <userPortfolio> to suggest tokens they actually own
- If user says "swap my X", look for X in <userPortfolio> to confirm they have it
- Use decimal precision shown in <userPortfolio> for accurate amount formatting
</instructions>

<keys>
${formatZodKeys(extractedSwapParamsSchema)}
</keys>

<output>
${formatZodOutput(extractedSwapParamsSchema)}

CRITICAL: Your response must contain ONLY the JSON object, no explanations or additional text.
</output>`;
