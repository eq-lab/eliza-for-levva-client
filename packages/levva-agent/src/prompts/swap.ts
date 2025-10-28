/**
 * Swap parameter extraction prompt
 *
 * @version 1.1.0
 * @lastModified 2025-01-28
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
        "Token symbol (e.g., 'USDC', 'ETH') or contract address (0x...) to swap FROM. " +
          "Extract the source token the user wants to swap. " +
          "Examples: 'USDC', 'WETH', '0xAf88d065e77c8cC2239327C5EDb3A432268e5831'. " +
          "Return null if not specified."
      ),
    toToken: z
      .string()
      .nullable()
      .describe(
        "Token symbol (e.g., 'WETH', 'DAI') or contract address (0x...) to swap TO. " +
          "Extract the destination token the user wants to receive. " +
          "Examples: 'WETH', 'DAI', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'. " +
          "Return null if not specified."
      ),
    amount: z
      .string()
      .nullable()
      .describe(
        "Numeric amount as string (e.g., '100', '0.5') or percentage/keyword ('50%', 'all', 'max'). " +
          "Extract the amount the user wants to swap, denominated in the FROM token. " +
          'Examples: "100" (NOT "100 USDC"), "0.5" (NOT "0.5 tokens"), "50%", "all", "max". ' +
          "Return null if not specified."
      ),
  })
  .describe("Extracted swap parameters from user messages");

/** Extracted swap parameters type inferred from Zod schema */
export type ExtractedSwapParams = z.infer<typeof extractedSwapParamsSchema>;

export const selectSwapDataFromMessagesPrompt = (ctx: {
  recentMessages: string;
  tokens: string;
  intentContext?: {
    type: string;
    returnData?: Record<string, any>;
    memories?: string;
  };
}) => `<task>
Extract swap transaction parameters from recent messages${ctx.intentContext ? " using intent context for improved accuracy" : ""}.
</task>

<recentMessages>
${ctx.recentMessages}
</recentMessages>

<knownTokens>
${ctx.tokens}
</knownTokens>

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
- Recognize percentage-based amounts (e.g., "50%" of balance, "all", "max")
${ctx.intentContext ? '- Leverage intent context to resolve ambiguous references (e.g., "that token" referring to previously mentioned tokens)' : ""}
</instructions>

<keys>
${formatZodKeys(extractedSwapParamsSchema)}
</keys>

<output>
${formatZodOutput(extractedSwapParamsSchema)}

CRITICAL: Your response must contain ONLY the JSON object, no explanations or additional text.
</output>`;
