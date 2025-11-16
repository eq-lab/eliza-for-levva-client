/**
 * Penfle parameter extraction prompt
 *
 * @version 1.0.0
 * @lastModified 2025-11-17
 * @changes v1.0.0: Initial implementation
 */

import { z } from "zod";
import { formatZodKeys, formatZodOutput } from "./util";

/** Zod schema for extracted Pendle parameters from user messages */
export const extractedPendleParamsSchema = z
  .object({
    thought: z
      .string()
      .describe(
        "Your analysis of the Pendle PT token swap, deposit, and withdraw request and parameter extraction. " +
          "Include reasoning about token identification, amount interpretation, and any ambiguities resolved using context."
      ),
    tokenClass: z
      .enum(["stable", "btc", "eth"])
      .nullable()
      .describe(
        "Token category from <supportedTokens> format: 'stable', 'btc', or 'eth'. " +
          "Examples: 'USD' → 'stable', 'BTC: WBTC' → 'btc', 'ETH: WETH' → 'eth'. " +
          "Extract from the prefix of supported token entries. " +
          "Return null if not specified or cannot be determined."
      ),
    token: z
      .string()
      .nullable()
      .describe(
        "Underlying token symbol for the PT token (e.g., 'USDC', 'USDe', 'WBTC', 'WETH'). " +
          "Must match one of the {token} values in <supportedTokens> list. " +
          "Return null if not specified."
      ),
    maturityDays: z
      .number()
      .int()
      .nullable()
      .describe(
        "Integer representing days from now until PT token maturity date. " +
          "Convert temporal expressions (e.g., '30 days' → 30, '3 months' → 90). " +
          "For absolute dates, calculate days from UTC now till the specified date. " +
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
    type: z
      .enum(["deposit", "withdraw", "buy", "sell"])
      .nullable()
      .describe(
        "Type of Pendle operation: 'deposit' (add liquidity), 'withdraw' (remove liquidity), 'buy' (purchase PT tokens), 'sell' (sell PT tokens). " +
          "Detect from user's intent: 'deposit to Pendle' → 'deposit', 'buy PT' → 'buy', 'swap to PT' → 'buy', 'sell PT' → 'sell'. " +
          "Return null if operation type cannot be determined from the message."
      ),
  })
  .describe(
    "Extracted Pendle PT token swap, deposit, and withdraw transaction parameters from user messages"
  );

/** Extracted Pendle parameters type inferred from Zod schema */
export type ExtractedPendleParams = z.infer<typeof extractedPendleParamsSchema>;

export const selectPendleDataFromMessagesPrompt = (ctx: {
  recentMessages: string;
  userPortfolio?: string;
  pendleTokens?: string;
  intentContext?: {
    type: string;
    returnData?: Record<string, any>;
    memories?: string;
  };
}) => `<task>
Extract Pendle transaction parameters from recent messages${ctx.intentContext ? " using intent context for improved accuracy" : ""}.
</task>
<supportedTokens>
Supported Pendle tokens:
${ctx.pendleTokens}
</supportedTokens>
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
- Choose token symbol {token} from <supportedTokens> symbols if ambiguous
- Extract the following information for the pendle swap transaction:
  * Token symbol or address to swap FROM (source token)
  * Token symbol or address to swap TO (destination token)  
  * Amount of tokens to swap (denominated in the FROM token)
- If multiple pendle swap requests exist, extract parameters for the MOST RECENT uncompleted swap
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
- The user MUST explicitly specify the token - do not infer or suggest if missing
- The token MUST be one of the {token} values from <supportedTokens> list
- Match the token symbol case-insensitively (e.g., "usdc" matches "USDC", "USDe" matches "usde")
- If the user specifies a token not in <supportedTokens>, return null and explain in the thought field

DAYS UNTIL MATURITY SELECTION GUIDANCE:
- The maturityDays value MUST be an integer representing the number of days from now until the token's maturity date
- Detect temporal expressions and convert to days:
  * "30 days" → 30
  * "3 weeks" → 21 (3 × 7)
  * "2 months" → 60 (2 × 30, approximate)
  * "1 year" → 365
- If the user specifies an absolute date (e.g., "December 2025", "2025-12-31"):
  * Calculate the number of days from UTC now to that date
- Maturity dates must be in the future - if calculated days is ≤ 0, return null
</instructions>

<keys>
${formatZodKeys(extractedPendleParamsSchema)}
</keys>

<output>
${formatZodOutput(extractedPendleParamsSchema)}

CRITICAL: Your response must contain ONLY the JSON object, no explanations or additional text.
</output>`;
