/**
 * Swap parameter extraction prompt
 * 
 * @version 1.0.1
 * @lastModified 2025-01-XX
 * @changes v1.0.1: Added intent context support for improved extraction
 * @changes v1.0.0: Initial implementation
 */

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

<parameterGuidelines>
- fromToken: Token symbol (e.g., "USDC", "ETH") or contract address (0x...) to swap FROM
- toToken: Token symbol (e.g., "WETH", "DAI") or contract address (0x...) to swap TO  
- amount: Numeric amount as string (e.g., "100", "0.5") or percentage (e.g., "50%", "all", "max")
</parameterGuidelines>

<output>
Respond using JSON format like this:
{
  "fromToken": string | null,
  "toToken": string | null,
  "amount": string | null
}

CRITICAL: Your response must contain ONLY the JSON object, no explanations or additional text.
</output>`;
