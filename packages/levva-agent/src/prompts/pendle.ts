/**
 * Pendle swap, deposit, and withdraw parameter extraction prompt
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
        "Your analysis of the Pendle request and parameter extraction. " +
          "Include reasoning about token identification, operation type (buy/sell/deposit/withdraw), " +
          "amount interpretation, maturity selection, and any ambiguities resolved using context."
      ),
    tokenClass: z
      .enum(["Stable", "BTC", "ETH"])
      .nullable()
      .describe(
        "Asset class category: 'Stable' (stablecoins), 'BTC' (Bitcoin-backed), or 'ETH' (Ethereum-backed). " +
          "ONLY extract if user explicitly mentions asset class. " +
          "Can be inferred from pendleToken if pendleToken is explicitly specified. " +
          "Return null if not explicitly specified."
      ),
    tokenIn: z
      .string()
      .nullable()
      .describe(
        "For buy/deposit: Non-PT, non-LP token from <userPortfolio> that user will spend. " +
          "For sell: token symbol prefixed with 'PT-' from <userPortfolio> that user will spend. " +
          "For withdraw: token symbol prefixed with 'LP-' from <userPortfolio> that user will spend. " +
          "CRITICAL: Asset class alone ('stable PT', 'BTC yield') is NOT sufficient. User MUST explicitly mention specific token symbol. Return null if no specific token mentioned."
      ),
    tokenOut: z
      .string()
      .nullable()
      .describe(
        "For buy/deposit: token symbol from <pendleTokens> (e.g., 'yoUSD', 'mRe7BTC'). User can prefix with 'PT' or 'PT-' (e.g., 'PT yoUSD', 'PT-yoUSD'), which MUST be stripped. " +
          "For sell/withdraw: Non-PT, non-LP token from <userPortfolio> that user will receive. " +
          "CRITICAL: Asset class alone ('stable PT', 'BTC yield') is NOT sufficient. User MUST explicitly mention specific token symbol. Return null if no specific token mentioned."
      ),
    maturityDays: z
      .enum(["<=30", "30-90", ">90"])
      .nullable()
      .describe(
        "Maturity timeframe category: '<=30' (short-term, up to 1 month), '30-90' (medium-term, 1-3 months), '>90' (long-term, 3+ months). " +
          "Map user's maturity preference to the nearest category when specified. " +
          "Convert numbers/expressions: '15 days' → '<=30', '60 days' → '30-90', '6 months' → '>90'. " +
          "For ranges, pick nearest: '1-2 months' → '30-90'. " +
          "For absolute dates, calculate days from now and categorize. " +
          "MUST be explicitly specified. Return null if not specified."
      ),
    amount: z
      .string()
      .regex(
        /^[0-9]+(\.[0-9]+)?$/,
        "Amount MUST be numeric string without symbols"
      )
      .nullable()
      .describe(
        'Amount to use, as numeric string (e.g., "100", "0.5"). ' +
          "Use token decimal precision from provided balance in <userPortfolio> data for the specified tokenIn. " +
          "Convert percentages/keywords: 50% → (0.5 × balance), 'all'/'max' → full balance. " +
          "NEVER include %, $, currency symbols, or token names in the value."
      ),
    operationType: z
      .enum(["deposit", "withdraw", "buy", "sell"])
      .nullable()
      .describe(
        "Operation type - MUST be explicitly mentioned by user with clear action verbs:" +
          "- 'buy': User says 'buy', 'purchase', 'long', 'invest in', 'get PT'" +
          "- 'sell': User says 'sell', 'exit', 'close position', 'redeem PT'" +
          "- 'deposit': User says 'deposit', 'add liquidity', 'provide liquidity', 'LP'" +
          "- 'withdraw': User says 'withdraw', 'remove liquidity', 'exit pool', 'unstake'" +
          "CRITICAL: Return null if user does NOT use clear action verbs. Vague phrases like 'I want a PT token', 'interested in PT', or 'explore Pendle strategies' → return null."
      ),
    slippage: z
      .string()
      .regex(
        /^0(\.[0-9]{1,3})?$/,
        "Slippage MUST be between 0 and 1 with up to 3 decimal places"
      )
      .nullable()
      .describe(
        "Slippage tolerance as decimal string between 0 and 1 (e.g., '0.01' for 1%, '0.005' for 0.5%). " +
          "MUST be trimmed to maximum 3 decimal places: '0.1' (10%), '0.05' (5%), '0.001' (0.1%). " +
          "Return null if not specified. Defaults to 0.005 (0.5%) if null."
      ),
  })
  .describe(
    "Extracted parameters for Pendle PT token operations (buy, sell, deposit, withdraw)"
  );

/** Extracted Pendle parameters type inferred from Zod schema */
export type ExtractedPendleParams = z.infer<typeof extractedPendleParamsSchema>;

export const selectPendleDataFromMessagesPrompt = (ctx: {
  currentMessage?: string;
  userPortfolio?: string;
  pendleTokens?: string;
  intentContext?: {
    type: string;
    returnData?: Record<string, any>;
    memories?: string;
  };
}) => `<task>
Extract Pendle transaction parameters from <currentMessage>${ctx.intentContext ? " using intent context for improved accuracy" : ""}.
</task>

<pendleTokens>
Format: comma separated list of Pendle PT tokens/markets ('ptToken','class')

${ctx.pendleTokens}
</pendleTokens>

<userPortfolio>
Format: comma separated list of ('token','balance')

${ctx.userPortfolio}
</userPortfolio>

<currentMessage>
${ctx.currentMessage}
</currentMessage>
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
1. **HIGHEST PRIORITY**: If user explicitly specifies a parameter in their <currentMessage>, ALWAYS use that value (overrides ALL previous context)
2. Use returnData from previous interactions ONLY to fill parameters NOT mentioned in <currentMessage>
3. **PARAMETER UPDATES**: If user says "use X instead", "with X", "change to X" in their <currentMessage>, the NEW value ALWAYS replaces returnData value
4. This is part of an ongoing Pendle operation - use <intentContext> for missing parameters only
5. Consider the full conversation history ("Intent Conversation History") within this intent for context
6. RETRY HANDLING: If user says "retry"/"try again" and returnData has complete parameters, reuse those exact values
7. CONTINUATION: If user says "yes"/"ok"/"proceed" with NO new specifications, use returnData parameters as-is

GENERAL INSTRUCTIONS:
`
    : ""
}
- **CRITICAL**: Read user input EXACTLY as written - do not misread or hallucinate token names
  * Example: "yousd" is NOT "yusd" - they are different strings
  * Example: "yousd" matches "yoUSD" case-insensitively
  * Double-check the EXACT spelling in <currentMessage> before matching to <pendleTokens>
- **CRITICAL DISTINCTION**: tokenClass and tokenOut are INDEPENDENT parameters
  * tokenClass = asset category filter (Stable/BTC/ETH) - can be mentioned by user OR inferred
  * tokenOut = specific token name or symbol - MUST be explicitly mentioned by user
  * **tokenClass alone is NOT sufficient**: Specifying only asset class without specific token name always results in tokenOut: null
- NEVER infer or suggest tokenIn, tokenOut, amount, maturityDays if not explicitly specified
- If multiple Pendle requests exist, extract parameters for the MOST RECENT uncompleted one
- **CRITICAL**: Extract parameters ONLY from USER messages, NOT from agent/Levvski responses
${ctx.intentContext ? '- Leverage intent context to resolve ambiguous references (e.g., "that token" referring to previously mentioned tokens)' : ""}

OPERATION TYPE GUIDANCE:
**CRITICAL**: User MUST use clear action verbs. Vague expressions return null.

- **buy**: User explicitly says action verbs for purchasing
  * Valid phrases: "buy PT", "purchase PT", "invest in PT", "long PT", "get PT", "acquire PT"
  * Invalid phrases: "I want PT", "explore Pendle strategies", "looking at PT" → return **null**

- **sell**: User explicitly says action verbs for selling PT tokens
  * Valid phrases: "sell PT", "exit position", "redeem PT", "close position", "liquidate PT"
  * Invalid phrases: "what about my PT", "check PT value" → return **null**

- **deposit**: User explicitly says action verbs for adding liquidity
  * Valid phrases: "deposit to Pendle", "add liquidity", "LP Pendle", "provide liquidity", "stake in Pendle"
  * Invalid phrases: "tell me about liquidity", "show pools" → return **null**

- **withdraw**: User explicitly says action verbs for removing liquidity
  * Valid phrases: "withdraw from Pendle", "remove liquidity", "exit pool", "unstake", "pull out"
  * Invalid phrases: "how's my pool", "check my liquidity" → return **null**

TOKEN FLOW BY OPERATION:
**CRITICAL**: Understand tokenIn/tokenOut based on operation type:

- **buy**: tokenIn = token user SPENDS (from userPortfolio), tokenOut = token user RECEIVES (from pendleTokens)
- **sell**: tokenIn = PT token user SPENDS (PT-xxx from userPortfolio), tokenOut = token user RECEIVES (from userPortfolio)
- **deposit**: tokenIn = token user SPENDS (from userPortfolio), tokenOut = token user RECEIVES (from pendleTokens)
- **withdraw**: tokenIn = LP token user SPENDS (LP-xxx from userPortfolio), tokenOut = token user RECEIVES (from userPortfolio)

AMOUNT PARSING RULES:
- Extract only numeric values: "100", "0.5", "1000".
- Amount refers to tokenIn (what user is spending/using).
- Percentage conversion: If user says "50%" → look up tokenIn in <userPortfolio>, compute 0.5 × "balance" value.
- Keyword conversion: If user says "all"/"max" → look up tokenIn in <userPortfolio>, use full "balance" value.
- Trim trailing zeros (e.g., "15.460000" → "15.46").
- If token not in portfolio or balance unavailable: Return null for amount, explain reason in thought field.
- NEVER include: %, $, currency symbols, or token symbols in the amount field.
- NEVER infer or suggest amount if not explicitly specified.

SLIPPAGE PARSING RULES:
- Slippage is OPTIONAL - only extract if user explicitly mentions it
- MUST be a decimal string between 0 and 1 with maximum 3 decimal places
- **Convert percentages to decimals**:
  * "1%" or "1 percent" → "0.01"
  * "0.5%" → "0.005"
  * "5%" → "0.05"
  * "10%" → "0.1"
- **Trim to 3 decimal places**:
  * "0.005100" → "0.005"
  * "0.123" → "0.123"

TOKEN CLASS SELECTION GUIDANCE:
**CRITICAL**: tokenClass alone is NOT sufficient to select a token. Specific token symbol is always required.

- **Asset Classes**:
  * **"Stable"**: Stablecoins
  * **"BTC"**: Bitcoin-backed assets
  * **"ETH"**: Ethereum-backed assets

- **Extraction Rules**:
  * Extract tokenClass when user mentions asset type/category: "stable", "stablecoin", "BTC", "bitcoin", "ETH", "ethereum"
  * Common phrases: "stable PT", "BTC yield", "ETH yield", "USD yield" → extract tokenClass
  * Can be inferred from tokenOut when tokenOut is explicitly specified
  * tokenClass is INDEPENDENT from tokenOut - they are separate parameters

- **CRITICAL**: Asset class only (no specific token) → tokenOut must be null
  * "I want a stable PT" → tokenClass: "Stable", tokenOut: **null**
  * "I want BTC yield" → tokenClass: "BTC", tokenOut: **null**
  * "I want PT yoUSD" → tokenClass: "Stable" (inferred), tokenOut: "yoUSD"

TOKEN SELECTION GUIDANCE:

**tokenIn** (token user will SPEND):
- **For "buy"/"deposit" operations**:
  * Non-PT, non-LP token from <userPortfolio> that user will spend
  * **CRITICAL**: Return null if user does NOT explicitly mention a specific token.
  * Example: "buy PT with USDC" → tokenIn: "USDC"

- **For "sell" operations**:
  * Must be PT-prefixed token from <userPortfolio> (e.g., "PT-USDe-11DEC2025")
  * User says "sell my PT-USDe" → tokenIn: "PT-USDe-11DEC2025" (match from portfolio)
  * **CRITICAL**: Return null if user does NOT explicitly mention which PT token to sell.

- **For "withdraw" operations**:
  * Must be LP-prefixed token from <userPortfolio> (e.g., "LP-yoUSD-26MAR2026")
  * User says "withdraw my LP yoUSD" → tokenIn: "LP-yoUSD-26MAR2026" (match from portfolio)
  * **CRITICAL**: Return null if user does NOT explicitly mention which LP token to withdraw.

**tokenOut** (token user will RECEIVE):
- **For "buy" operations**:
  * Token symbol from <pendleTokens> (e.g., "yoUSD", "mRe7BTC")
  * **Strip descriptive keywords before matching**:
    - Remove "PT", "PT-" prefix: "PT yoUSD" → "yoUSD", "PT-USDC" → "USDC"
    - Remove "Pendle" keyword: "Pendle yoUSD" → "yoUSD"
    - Combined: "buy Pendle PT yoUSD" → "yoUSD"
  * Match case-insensitively after stripping keywords
  * **CRITICAL**: Return null if no specific token mentioned or token not in <pendleTokens>

- **For "deposit" operations**:
  * Token symbol from <pendleTokens> for the LP pool (e.g., "yoUSD" for LP-yoUSD)
  * **Strip descriptive keywords before matching**:
    - Remove "LP", "LP-" prefix: "LP yoUSD" → "yoUSD"
    - Remove "Pendle" keyword: "deposit into Pendle yoUSD" → "yoUSD"
  * **CRITICAL**: Return null if no specific token mentioned

- **For "sell"/"withdraw" operations**:
  * Non-PT, non-LP token user wants to RECEIVE (from <userPortfolio>)
  * Example: "sell PT-USDe for USDC" → tokenOut: "USDC"
  * **CRITICAL**: Return null if user does NOT explicitly mention what token to receive

**General Rules:**
- Extract tokens ONLY when user explicitly mentions specific token names or symbols
- Asset class alone ('stable', 'BTC', 'ETH') is NOT sufficient - specific token name required
- NEVER infer or suggest tokens based on user's intent or class alone
- Return null for any parameter not explicitly specified
- **CRITICAL**: Phrases like "you can consider PT yoUSD or PT USDX" are agent suggestions, NOT user selections - return null

**Extraction Examples:**

Given <userPortfolio>: [("USDC","3"), ("ETH","0.011"), ("PT-USDe-11DEC2025","0.316"), ("LP-yoUSD-26MAR2026","1.5")]
Given <pendleTokens>: [("yoUSD","Stable"), ("USDX","Stable"), ("mRe7BTC","BTC"), ("USDe","Stable")]

- **Informational queries (all null)**:
  * "I want a PT" → operationType: null, tokenIn: null, tokenOut: null, tokenClass: null, amount: null
  * "interested in PT" → operationType: null, tokenIn: null, tokenOut: null, tokenClass: null, amount: null

- **Asset class only (tokenOut: null)**:
  * "I want a stable PT" → operationType: null, tokenOut: null, tokenClass: "Stable", tokenIn: null, amount: null
  * "buy stable PT" → operationType: "buy", tokenOut: null, tokenClass: "Stable", tokenIn: null, amount: null

- **Buy operations** (tokenIn = spend, tokenOut = PT to receive):
  * "buy PT yoUSD with 100 USDC" → operationType: "buy", tokenIn: "USDC", tokenOut: "yoUSD", tokenClass: "Stable", amount: "100"
  * "buy PT yoUSD using ETH" → operationType: "buy", tokenIn: "ETH", tokenOut: "yoUSD", tokenClass: "Stable", amount: null
  * "buy PT mRe7BTC" → operationType: "buy", tokenIn: null, tokenOut: "mRe7BTC", tokenClass: "BTC", amount: null

- **Sell operations** (tokenIn = PT to sell, tokenOut = token to receive):
  * "sell my PT-USDe" → operationType: "sell", tokenIn: "PT-USDe-11DEC2025", tokenOut: null, tokenClass: "Stable"
  * "sell PT-USDe for USDC" → operationType: "sell", tokenIn: "PT-USDe-11DEC2025", tokenOut: "USDC", tokenClass: "Stable"

- **Deposit operations** (tokenIn = spend, tokenOut = LP pool):
  * "deposit 1 USDC into yoUSD pool" → operationType: "deposit", tokenIn: "USDC", tokenOut: "yoUSD", tokenClass: "Stable", amount: "1"
  * "add liquidity to Pendle yoUSD" → operationType: "deposit", tokenIn: null, tokenOut: "yoUSD", tokenClass: "Stable", amount: null

- **Withdraw operations** (tokenIn = LP to withdraw, tokenOut = token to receive):
  * "withdraw my LP yoUSD" → operationType: "withdraw", tokenIn: "LP-yoUSD-26MAR2026", tokenOut: null, tokenClass: "Stable"
  * "withdraw LP yoUSD for USDC" → operationType: "withdraw", tokenIn: "LP-yoUSD-26MAR2026", tokenOut: "USDC", tokenClass: "Stable"

MATURITY DAYS SELECTION GUIDANCE:
Categories: "<=30" (short-term, 1-30d), "30-90" (medium-term, 31-90d), ">90" (long-term, 91+d)

**Mapping:**
1. Explicit days: 1-30 → "<=30", 31-90 → "30-90", 91+ → ">90"
2. Temporal: "1 week"=7d → "<=30", "2 months"=60d → "30-90", "6 months"=180d → ">90"
3. Ranges: Use midpoint. "1-2 months" → 45d → "30-90"
4. Absolute dates: Calculate days from now, then categorize. Past dates → null
5. Terms: "short"/"soon" → "<=30", "medium" → "30-90", "long" → ">90"
6. Boundaries: 30 days → "<=30", 90 days → "30-90", 180 days → ">90"
7. Phrases: "Up to 30 days" → "<=30", "30 to 90 days" → "30-90", "More than 90 days" → ">90", "Next year" → ">90"
</instructions>

<keys>
${formatZodKeys(extractedPendleParamsSchema)}
</keys>

<output>
${formatZodOutput(extractedPendleParamsSchema)}

CRITICAL: Your response MUST contain ONLY the JSON object, no explanations or additional text.
</output>`;
