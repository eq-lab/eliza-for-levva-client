/**
 * Deposit parameter extraction prompt
 * 
 * @version 1.1.0
 * @lastModified 2025-01-XX
 * @changes v1.1.0: Standardized amount field to string type
 * @changes v1.0.0: Initial implementation with vault/pool strategy support
 */

import { DataDescription, formatKeys, formatOutput } from "./util";

export interface ExtractedDataForDeposit {
  strategyId?: number;
  strategyName?: string;
  strategyRisk?: string;
  tokenSymbol?: string;
  tokenAddress?: string;
  amount?: string; // numeric string only (e.g., "100" or "0.5")
  leverage?: number;
  confidence: number;
  thought: string;
}

const dataDescription: DataDescription<ExtractedDataForDeposit> = {
  strategyId: {
    type: "number",
    description: "The ID of the strategy to deposit into, if specified",
    default: "null",
  },
  strategyName: {
    type: "string",
    description: "The name of the strategy to deposit into, if specified",
    default: "null",
  },
  strategyRisk: {
    type: "string",
    description:
      'The risk profile of the strategy: "ultra-safe", "safe", "brave", or "custom"',
    default: "null",
  },
  tokenSymbol: {
    type: "string",
    description: "The symbol of the token to deposit (e.g., USDC, ETH, WETH)",
    default: "null",
  },
  tokenAddress: {
    type: "string",
    description: "The contract address of the token to deposit, if provided",
    default: "null",
  },
  amount: {
    type: "string",
    description:
      "Numeric string amount only (e.g., '100', '0.5'). If user specifies a percentage (e.g., '30%') or keywords ('all', 'max') and the token is known, convert to a numeric string using user's token balance from <userPortfolio>. If you cannot compute (token unknown or balance missing), set amount to null and explain in thought.",
    default: "null",
  },
  leverage: {
    type: "number",
    description: "The leverage multiplier for 'pool' strategies (1-10)",
    default: "null",
  },
  confidence: {
    type: "number",
    description:
      "Confidence score from 0 to 1 based on clarity of extracted parameters",
  },
  thought: {
    type: "string",
    description:
      "Analysis of the user's deposit request and parameter extraction",
  },
};

export const extractDepositDataFromMessagePrompt = (ctx: {
  inheritedData?: Record<string, any>;
  returnData?: Record<string, any>;
  messages?: string;
  strategyIdMap: Record<number, string>;
  availableStrategies: string;
  userPortfolio: string;
  availableTokens: string;
}) => {
  const currentMessage = ctx.messages?.split("\n").pop() || "";

  const strategyContext =
    Object.keys(ctx.strategyIdMap).length > 0
      ? `\n<availableStrategies>
${ctx.availableStrategies}

Strategy ID mapping:
${Object.entries(ctx.strategyIdMap)
  .map(([id, info]) => `${id}: ${info}`)
  .join("\n")}
</availableStrategies>`
      : "";

  const portfolioContext = ctx.userPortfolio
    ? `\n<userPortfolio>
Current portfolio:
${ctx.userPortfolio}
</userPortfolio>`
    : "";

  const tokensContext = ctx.availableTokens
    ? `\n<availableTokens>
Known tokens:
${ctx.availableTokens}
</availableTokens>`
    : "";

  const conversationContext =
    ctx.messages && ctx.messages.includes("\n")
      ? `\n<conversationHistory>
${ctx.messages.split("\n").slice(0, -1).join("\n")}
</conversationHistory>`
      : "";

  const inheritedContext =
    ctx.inheritedData && Object.keys(ctx.inheritedData).length > 0
      ? `\n<inheritedData>
${JSON.stringify(ctx.inheritedData)}
</inheritedData>`
      : "";

  const returnDataContext =
    ctx.returnData && Object.keys(ctx.returnData).length > 0
      ? `\n<returnData>
${JSON.stringify(ctx.returnData)}
</returnData>`
      : "";

  return `<task>
Extract deposit parameters from user message for investment transaction processing.
Consider available strategies, user portfolio, and conversation context.
</task>
<message>
${currentMessage}
</message>${strategyContext}${portfolioContext}${tokensContext}${conversationContext}${inheritedContext}${returnDataContext}
<instructions>
Analyze the user message and extract deposit-related parameters using the provided context.

CRITICAL DEPOSIT LOGIC:
- **Strategy Detection**: Extract strategy by name, risk level ("ultra-safe", "safe", "brave"), or ID
- **Token Detection**: 
  - For VAULT strategies: Token is automatically determined by the vault's underlyingToken - DO NOT extract tokenSymbol/tokenAddress unless user explicitly mentions a different token (for validation)
  - For POOL strategies: Extract token symbols/addresses from user input
  - Handle ETH/WETH aliases appropriately
- **Amount Detection**: Return only numeric amounts as strings (e.g., "100", "0.5").
  - If user specifies a percentage (e.g., "30%") AND the token is known (vault underlying token or explicitly provided token), compute absolute amount = percentage × user's available balance of that token from <userPortfolio>.
  - If user says "all" or "max" AND the token is known, use the full available balance for that token from <userPortfolio> as a numeric string.
  - If token is not known or the balance is not found in <userPortfolio>, set amount to null and explain the reason in the thought.
  - Strip currency and token symbols from numeric inputs (e.g., "100 USDC" -> "100").
- **Leverage Detection**: Extract leverage for pool strategies (1-10x)

CONTEXT-AWARE EXTRACTION:
- **Conversation History**: Use previous messages to fill missing parameters
- **Inherited Data**: Leverage data from previous intent interactions
- **Return Data**: Build on previously extracted parameters
- **Smart Inference**: If user says "deposit into ultra-safe" and conversation shows USDC discussion, infer USDC
- **Avoid Redundancy**: Don't ask for info that's already available in context

RETURN FORMAT CONSTRAINTS:
- amount MUST be a numeric string matching regex ^[0-9]+(\.[0-9]+)?$ when present.
- Never include percent signs, currency symbols, or token symbols in amount.
- When converting from percentage or "all"/"max", format the computed number as a plain decimal string with up to 6 fractional digits, trimming trailing zeros (e.g., "15.460000" -> "15.46").
- If unable to compute a numeric string (e.g., token unknown or balance missing), set amount to null and explain why in thought.

EXTRACTION PRIORITY:
1. **Current Message**: Direct parameter extraction from user's latest message
2. **Conversation Context**: Fill gaps using conversation history
3. **Inherited/Return Data**: Use previously extracted or inherited parameters
4. **Smart Defaults**: Infer reasonable defaults from available context
5. **Portfolio Matching**: Match mentioned tokens with user's actual holdings

CONFIDENCE SCORING:
- **High (0.8-1.0)**: All required parameters clearly specified or inferrable
- **Medium (0.5-0.7)**: Some parameters clear, others inferrable from context
- **Low (0.2-0.4)**: Limited information, requires user clarification
- **Very Low (0.0-0.1)**: Insufficient information to proceed

STRATEGY MATCHING:
- Match strategy names case-insensitively
- Match risk profiles: "ultra-safe", "safe", "brave", "custom"
- Use strategy ID if explicitly mentioned
- Consider strategy descriptions for fuzzy matching

TOKEN MATCHING:
- **For VAULT strategies**: Only extract token if user explicitly mentions it (for validation against vault's underlyingToken)
- **For POOL strategies**: Extract token from user input and match against availableTokens
- Check user portfolio for token availability
- Handle wrapped token conversions (ETH <-> WETH)
- Accept contract addresses if provided
- **Strategy-Token Validation**: If both strategy and token are mentioned, ensure token is compatible with strategy type

AMOUNT PARSING:
- Accept numeric values: "100", "0.5", "1000"
- Percentages: if token is known and its balance is present in <userPortfolio>, compute absolute amount (e.g., if USDC balance is 51.53 and user says "30%", return "15.459" rounded to at most 6 decimals, then trim trailing zeros → "15.459").
- Keywords: if user says "all" or "max" and token balance is present, return the full balance as numeric string (trim trailing zeros).
- Remove currency or token symbols (e.g., "$100 USDC" -> "100").
</instructions>
<keys>
${formatKeys(dataDescription)}
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
