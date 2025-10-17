/**
 * Deposit parameter extraction prompt
 *
 * @version 1.1.0
 * @lastModified 2025-01-XX
 * @changes v1.1.0: Standardized amount field to string type
 * @changes v1.0.0: Initial implementation with vault/pool strategy support
 */

import { z } from "zod";
import { formatZodKeys, formatZodOutput } from "./util";

export const extractedDataForDepositSchema = z
  .object({
    thought: z
      .string()
      .describe(
        "Your reasoning about which parameters were extracted and confidence level"
      ),
    confidence: z
      .number()
      .describe(
        "Confidence level (0.0-1.0) that the user wants to perform a deposit/investment action"
      ),
    strategyId: z
      .number()
      .optional()
      .describe("The ID of the strategy to deposit into, if specified"),
    strategyName: z
      .string()
      .optional()
      .describe("The name of the strategy to deposit into, if specified"),
    strategyRisk: z
      .string()
      .optional()
      .describe(
        'The risk profile of the strategy: "ultra-safe", "safe", "brave", or "custom"'
      ),
    contractAddress: z
      .string()
      .optional()
      .describe(
        "The contract address of the strategy/vault if provided (e.g., 0xCF9bdc...)"
      ),
    tokenSymbol: z
      .string()
      .optional()
      .describe("The symbol of the token to deposit (e.g., USDC, ETH, WETH)"),
    tokenAddress: z
      .string()
      .optional()
      .describe(
        "The contract address of the token to deposit, if specified (e.g., 0xAf88...)"
      ),
    amount: z
      .string()
      .optional()
      .describe(
        'Numeric string only (e.g., "100" or "0.5"). NEVER include currency symbols or units, just the number'
      ),
    leverage: z
      .number()
      .optional()
      .describe(
        "The leverage multiplier for pool strategies (e.g., 2 for 2x leverage). Only applicable for pool strategies, not vault strategies"
      ),
  })
  .describe("Extracted deposit parameters from user message");

export type ExtractedDataForDeposit = z.infer<
  typeof extractedDataForDepositSchema
>;

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

⚠️ **CRITICAL PARAMETER OVERRIDE RULE**: When the user explicitly mentions a NEW value for any parameter (strategy, token, amount, leverage), you MUST extract and return that parameter to OVERRIDE the old value in <returnData>. For example:
- User says "I want to deposit WETH instead" → Extract tokenSymbol="WETH" (overrides previous USDC)
- User says "use custom strategy" → Extract strategyRisk="custom" (overrides previous strategy)
- User mentions contract "0xCF9bdc..." → Look it up in <availableStrategies>, extract corresponding strategyId/name/risk (overrides previous strategy)

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
- **CRITICAL - Parameter Overriding**: If the user EXPLICITLY mentions a NEW value for a parameter that was previously set in <returnData>, you MUST return the NEW value to OVERRIDE the old one. For example:
  - If returnData has strategyId=1 (ultra-safe) and user says "I want to use custom strategy", extract strategyRisk="custom" to override
  - If returnData has tokenSymbol="USDC" and user says "I want to deposit WETH instead", extract tokenSymbol="WETH" to override
  - If user says "deposit into 0xCF9bdc..." when returnData already has a different strategy, extract contractAddress="0xCF9bdc..." to override
- **EXTRACTION PRIORITY** (extract ONLY what user explicitly mentions):
  - If user provides contract address (e.g., "0xCF9bdc...") → Extract ONLY contractAddress, DO NOT extract strategyId/strategyName/strategyRisk
  - If user provides strategy ID → Extract ONLY strategyId, DO NOT extract strategyName/strategyRisk/contractAddress
  - If user provides strategy name → Extract ONLY strategyName, DO NOT extract strategyRisk/strategyId/contractAddress
  - If user provides risk level → Extract ONLY strategyRisk, DO NOT extract other strategy identifiers
- **Smart Inference**: If user says "deposit into ultra-safe" and conversation shows USDC discussion, infer USDC
- **Avoid Redundancy**: Don't ask for info that's already available in context AND not being changed

RETURN FORMAT CONSTRAINTS:
- amount MUST be a numeric string matching regex ^[0-9]+(\.[0-9]+)?$ when present.
- Never include percent signs, currency symbols, or token symbols in amount.
- When converting from percentage or "all"/"max", format the computed number as a plain decimal string with up to 6 fractional digits, trimming trailing zeros (e.g., "15.460000" -> "15.46").
- If unable to compute a numeric string (e.g., token unknown or balance missing), set amount to null and explain why in thought.

EXTRACTION PRIORITY:
1. **Current Message**: Direct parameter extraction from user's latest message
   - If user mentions a CONTRACT ADDRESS (e.g., "0xCF9bdc..."), extract ONLY contractAddress (highest priority identifier)
   - If user mentions a strategy ID, extract ONLY strategyId
   - If user mentions a strategy NAME or RISK (e.g., "custom strategy", "ultra-safe"), extract the corresponding identifier
   - If user explicitly changes a parameter that was already in <returnData>, extract the NEW value to override
   - DO NOT extract multiple strategy identifiers - only the one explicitly mentioned
2. **Conversation Context**: Fill gaps using conversation history
3. **Inherited/Return Data**: Use previously extracted or inherited parameters ONLY if user has not specified a different value
4. **Smart Defaults**: Infer reasonable defaults from available context
5. **Portfolio Matching**: Match mentioned tokens with user's actual holdings

CONFIDENCE SCORING:
- **High (0.8-1.0)**: All required parameters clearly specified or inferrable
- **Medium (0.5-0.7)**: Some parameters clear, others inferrable from context
- **Low (0.2-0.4)**: Limited information, requires user clarification
- **Very Low (0.0-0.1)**: Insufficient information to proceed

STRATEGY MATCHING:
- **Priority Order**: contractAddress > strategyId > strategyName > strategyRisk
- **Contract Address** (highest priority): If user provides "0xCF9bdc...", extract ONLY contractAddress
- **Strategy ID** (2nd priority): If user provides numeric ID, extract ONLY strategyId  
- **Strategy Name** (3rd priority): Match names case-insensitively, extract ONLY strategyName
- **Risk Profile** (lowest priority): Match "ultra-safe", "safe", "brave", "custom", extract ONLY strategyRisk
- **IMPORTANT**: Extract ONLY the identifier type user mentions - do not extract multiple strategy identifiers
- **When user changes strategy**: If <returnData> has existing strategy but user mentions DIFFERENT one, extract the NEW identifier to override

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
${formatZodKeys(extractedDataForDepositSchema)}
</keys>
<output>
${formatZodOutput(extractedDataForDepositSchema)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
