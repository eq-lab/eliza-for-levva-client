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
        "Asset class category: 'Stable' (stablecoins like USDC, USDe), 'BTC' (Bitcoin-backed like WBTC), or 'ETH' (Ethereum-backed like WETH, stETH). " +
          "ONLY extract if user explicitly mentions asset class. " +
          "Can be inferred from tokenOut if tokenOut is explicitly specified. " +
          "Return null if tokenOut is not specified or cannot be determined."
      ),
    tokenOut: z
      .string()
      .nullable()
      .describe(
        "Token selection depends on operation type:\n" +
          "- For 'buy'/'deposit': PT token from <supportedTokens> (e.g., 'USDe', 'WBTC', 'WETH'). User can prefix with 'PT' (e.g., 'PT USDC'), which should be stripped.\n" +
          "- For 'sell'/'withdraw': Non-PT token from <userPortfolio> to receive (e.g., 'USDC', 'ETH'). Use underlying asset if not specified.\n" +
          "- If user only mentions token class (e.g., 'stable PT', 'BTC PT', 'USD yield', 'ETH yield', 'BTC yield') without specific token symbol → return null. " +
          "CRITICAL: Return null if user does NOT explicitly mention a specific token name or symbol. Do NOT infer or suggest tokens."
      ),
    tokenIn: z
      .string()
      .nullable()
      .describe(
        "Token selection depends on operation type:\n" +
          "- For 'buy'/'deposit': Regular token from <userPortfolio> to spend (e.g., 'USDC', 'ETH', 'WETH'). Must have sufficient balance.\n" +
          "- For 'sell'/'withdraw': PT token from <userPortfolio> to sell/burn (e.g., 'PT-USDe-2025-12-31'). Look for tokens with 'PT-' prefix.\n" +
          "Return null if not explicitly specified by user."
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
          "Must be explicitly specified. Return null if not specified."
      ),
    amountIn: z
      .string()
      .regex(
        /^[0-9]+(\.[0-9]+)?$/,
        "Amount MUST be numeric string without symbols"
      )
      .nullable()
      .describe(
        'Amount of tokenIn to use, as numeric string (e.g., "100", "0.5"). ' +
          "Convert percentages/keywords: 50% → (0.5 × balance), 'all'/'max' → full balance. " +
          "NEVER include %, $, currency symbols, or token names in the value. " +
          "CRITICAL: Return null if user does NOT explicitly mention a specific amount, number, percentage, or keyword like 'all'/'max'. Do NOT infer, calculate, or suggest amounts."
      ),
    type: z
      .enum(["deposit", "withdraw", "buy", "sell"])
      .nullable()
      .describe(
        "Operation type:\n" +
          "- 'buy': Purchase PT tokens (swap tokenIn → PT-tokenOut)\n" +
          "- 'sell': Sell PT tokens back to underlying (PT-tokenOut → tokenIn)\n" +
          "- 'deposit': Add liquidity to Pendle pool\n" +
          "- 'withdraw': Remove liquidity from Pendle pool\n" +
          "Detect from user's intent: 'deposit to Pendle' → 'deposit', 'buy PT' → 'buy', 'swap to PT' → 'buy', 'sell PT' → 'sell', 'withdraw from Pendle' → 'withdraw'. " +
          "Return null if operation type cannot be determined from the message."
      ),
    slippage: z
      .string()
      .regex(
        /^0(\.[0-9]{1,3})?$/,
        "Slippage must be between 0 and 1 with up to 3 decimal places"
      )
      .nullable()
      .describe(
        "Slippage tolerance as decimal string between 0 and 1 (e.g., '0.01' for 1%, '0.005' for 0.5%). " +
          "Must be trimmed to maximum 3 decimal places: '0.1' (10%), '0.05' (5%), '0.001' (0.1%). " +
          "Return null if not specified. Defaults to 0.005 (0.5%) if null."
      ),
  })
  .describe(
    "Extracted parameters for Pendle PT token operations (buy, sell, deposit, withdraw)"
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
Format 'PT TOKEN_SYMBOL (CLASS, MATURITY_DATE)':
${ctx.pendleTokens}
</supportedTokens>
${
  ctx.userPortfolio
    ? `<userPortfolio>
User's wallet holdings (tokens they can use for transactions with non-zero balances and their decimals):
Format: TOKEN_SYMBOL: BALANCE (≈$BALANCE_USD)
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
1. This is part of an ongoing Pendle operation - prioritize information from <intentContext>
2. Use returnData from previous interactions to fill missing parameters
3. Consider the full conversation history within this intent for context
4. If parameters were partially specified earlier in this intent, complete them now
5. RETRY HANDLING: If user says "retry"/"try again" and returnData has complete parameters, reuse those exact values
6. CONTINUATION: If user says "yes"/"ok"/"proceed" and returnData has complete parameters, use those parameters

GENERAL INSTRUCTIONS:
`
    : ""
}
- Ignore messages for transactions that are either canceled or confirmed
- Extract these parameters for the Pendle transaction:
  * **tokenOut**: The underlying asset the PT token represents (from <supportedTokens>) - MUST be explicitly specified
  * **tokenIn**: The token user will spend (from <userPortfolio>)
  * **amountIn**: How much tokenIn to use - MUST be explicitly specified
  * **maturityDays**: Maturity timeframe category - MUST be explicitly specified
  * **type**: Operation type (buy/sell/deposit/withdraw)
  * **tokenClass**: Asset category (Stable/BTC/ETH) - can be extracted from user's mention OR inferred from tokenOut
- **CRITICAL DISTINCTION**: tokenClass and tokenOut are INDEPENDENT parameters
  * tokenClass = asset category filter (Stable/BTC/ETH) - can be mentioned by user OR inferred
  * tokenOut = specific token symbol (USDC/WBTC/WETH) - MUST be explicitly mentioned by user
  * "I want a stable PT" → tokenClass: **Stable** (mentioned), tokenOut: **null** (not specified)
  * "I want PT USDC" → tokenClass: **Stable** (inferred from USDC), tokenOut: **USDC** (specified)
- NEVER infer or suggest any parameters if not explicitly specified
- NEVER use default values for parameters if not explicitly specified
- If multiple Pendle requests exist, extract parameters for the MOST RECENT uncompleted one
- Handle common aliases: "PT USDe" = tokenOut: "USDe", "buy principal tokens" = type: "buy"
${ctx.intentContext ? '- Leverage intent context to resolve ambiguous references (e.g., "that token" referring to previously mentioned tokens)' : ""}

OPERATION TYPE GUIDANCE:
- **buy**: User wants to purchase PT tokens
  * Phrases: "buy PT", "purchase principal tokens", "invest in Pendle", "long PT"
  * Flow: spend tokenIn → receive PT-tokenOut
- **sell**: User wants to sell PT tokens back
  * Phrases: "sell PT", "exit position", "redeem PT", "close Pendle position"
  * Flow: spend PT-tokenOut → receive tokenIn
- **deposit**: User wants to provide liquidity to Pendle pool
  * Phrases: "deposit to Pendle", "add liquidity", "LP Pendle", "provide liquidity"
  * Flow: deposit tokenIn → receive LP tokens
- **withdraw**: User wants to remove liquidity from Pendle pool
  * Phrases: "withdraw from Pendle", "remove liquidity", "exit pool", "unstake"
  * Flow: burn Pendle LP tokens → receive tokenIn

AMOUNT PARSING RULES:
- Extract only numeric values: "100", "0.5", "1000"
- Use <userPortfolio> to see available balances
- Percentage conversion: If user says "50%" → look up token in <userPortfolio>, compute 0.5 × balance
- Keyword conversion: If user says "all"/"max" → look up token in <userPortfolio>, use full balance
- Trim trailing zeros (e.g., "15.460000" → "15.46")
- If token not in portfolio or balance unavailable: Return null for amountIn, explain reason in thought field
- NEVER include: %, $, currency symbols, or token symbols in the amountIn field
- NEVER infer or suggest amountIn if not explicitly specified

SLIPPAGE PARSING RULES:
- Slippage is OPTIONAL - only extract if user explicitly mentions it
- Must be a decimal string between 0 and 1 with maximum 3 decimal places
- **Convert percentages to decimals**:
  * "1%" or "1 percent" → "0.01"
  * "0.5%" → "0.005"
  * "5%" → "0.05"
  * "10%" → "0.1"
- **Trim to 3 decimal places**:
  * "0.005100" → "0.005"
  * "0.123" → "0.123"

TOKEN CLASS SELECTION GUIDANCE:
**CRITICAL**: tokenClass is used for filtering, but does NOT automatically select a specific token

- **Asset Classes**:
  * **"Stable"**: Stablecoins (USDC, USDe, DAI, USDT)
  * **"BTC"**: Bitcoin-backed assets (WBTC, tBTC)
  * **"ETH"**: Ethereum-backed assets (WETH, stETH, wstETH, rETH)

- **Extraction Rules**:
  * Extract tokenClass if user mentions asset type/category: "stable", "stablecoin", "BTC", "bitcoin", "ETH", "ethereum"
  * Common phrases: "stable PT", "BTC yield", "ETH yield", "USD yield" → extract tokenClass
  * Can be inferred from tokenOut if tokenOut is explicitly specified
  * tokenClass is INDEPENDENT from tokenOut - they are separate parameters

- **CRITICAL**: Extracting tokenClass does NOT mean you should extract tokenOut
  * "I want a stable PT" → tokenClass: "Stable", tokenOut: **null**
  * "I want BTC yield" → tokenClass: "BTC", tokenOut: **null**
  * "I want PT WBTC" → tokenClass: "BTC" (inferred), tokenOut: "WBTC"

TOKEN SELECTION GUIDANCE:

**For "buy" operations (purchasing PT tokens):**
- **tokenOut** (PT token to buy):
  * MUST be from <supportedTokens> list (available PT tokens for purchase)
  * User MUST explicitly specify token name or symbol (e.g., "USDC", "USDe", "WETH")
  * User can prefix with "PT" (e.g., "PT USDC" → "USDC")
  * Match case-insensitively (e.g., "usdc" matches "USDC")
  * **Example**: "I want to buy a PT" without token name → **return null for tokenOut**
  * **Example**: "buy PT USDC" → extract "USDC"
  * If user specifies token not in <supportedTokens>, return null and explain in thought field
- **tokenIn** (token to spend):
  * MUST be from <userPortfolio> (tokens user owns)
  * Select automatically the one non-PT token with the highest USD value in <userPortfolio>
  * Must have sufficient balance
  * MUST be the whole TOKEN_SYMBOL, not a partial match

**For "sell" operations (selling PT tokens):**
- **tokenIn** (PT token to sell):
  * MUST be a PT token from <userPortfolio> (PT tokens user owns)
  * Look for tokens with "PT-" prefix or in PT format in portfolio
  * User MUST explicitly specify which PT token to sell
  * If user specifies PT token they don't own, return null and explain
- **tokenOut** (token to receive):
  * MUST be a non-PT token from <userPortfolio> or underlying asset
  * Only extract if user explicitly specifies
  * Common case: user sells PT-USDe to get USDC/USDe back
  * If not specified, return null (backend will use underlying asset)

**General Rules:**
- Extract tokens ONLY when user explicitly mentions specific token names or symbols
- NEVER infer or suggest tokens based on user's intent alone
- Return null for any parameter not explicitly specified
- Always verify tokens exist in the correct source (<supportedTokens> or <userPortfolio>)

**Examples of what to extract:**
- "I want to buy a PT" → tokenOut: **null**, tokenClass: **null**, tokenIn: **null**, amountIn: **null**
- "buy PT" → tokenOut: **null**, tokenClass: **null**, tokenIn: **null**, amountIn: **null**
- "I want a stable PT" → tokenOut: **null**, tokenClass: **Stable**
- "I want a BTC PT" → tokenOut: **null**, tokenClass: **BTC**
- "buy stable coins PT" → tokenOut: **null**, tokenClass: **Stable**
- "buy PT USDC" → tokenOut: "USDC", tokenClass: "Stable" (inferred from USDC), tokenIn: **null**, amountIn: **null**
- "buy 100 PT USDC" → tokenOut: "USDC", tokenClass: "Stable", tokenIn: **null**, amountIn: "100"
- "buy 100 PT USDC with ETH" → tokenOut: "USDC", tokenClass: "Stable", tokenIn: "ETH", amountIn: "100"
- "buy all my ETH PT USDC" → tokenOut: "USDC", tokenClass: "Stable", tokenIn: "ETH", amountIn: (full ETH balance)

MATURITY DAYS SELECTION GUIDANCE:
The maturityDays field uses categorical ranges to simplify market selection:
- **"<=30"**: Short-term (up to 30 days / ~1 month)
- **"30-90"**: Medium-term (31-90 days / 1-3 months)
- **">90"**: Long-term (91+ days / 3+ months)

**Mapping Rules - Convert user input to the nearest category:**

1. **Explicit Days**:
  * 1-30 days → "<=30"
  * 31-90 days → "30-90"
  * 91+ days → ">90"
  * Examples: "15 days" → "<=30", "60 days" → "30-90", "120 days" → ">90"

2. **Temporal Expressions** (convert to days first, then categorize):
  * "1 week" = 7 days → "<=30"
  * "2 weeks" = 14 days → "<=30"
  * "1 month" = 30 days → "<=30"
  * "2 months" = 60 days → "30-90"
  * "3 months" = 90 days → "30-90"
  * "6 months" = 180 days → ">90"
  * "1 year" = 365 days → ">90"

3. **Date Ranges** (pick the midpoint, then categorize):
  * "1-2 weeks" → midpoint: 10 days → "<=30"
  * "1-2 months" → midpoint: 45 days → "30-90"
  * "3-6 months" → midpoint: 135 days → ">90"

4. **Absolute Dates** (calculate days from now, then categorize):
  * "March 15, 2025" → calculate days_until = (target_date - current_UTC_date)
  * If days_until is 1-30 → "<=30"
  * If days_until is 31-90 → "30-90"
  * If days_until is 91+ → ">90"
  * If days_until ≤ 0 (past date) → return null

5. **Relative Terms**:
  * "short-term" / "soon" / "quick" → "<=30"
  * "medium-term" / "moderate" → "30-90"
  * "long-term" / "far" / "extended" → ">90"

6. **Boundary Cases** (when exactly on boundary, prefer the longer category):
  * Exactly 30 days → "<=30"
  * Exactly 90 days → "30-90"

**Examples:**
  * "I want 2 week maturity" → 14 days → **"<=30"**
  * "Buy PT maturing in 45 days" → 45 days → **"30-90"**
  * "Long-term investment" → **">90"**
  * "Maturity around May 2025" → calculate days → categorize accordingly
  * "3-4 months" → midpoint: 105 days → **">90"**
</instructions>

<keys>
${formatZodKeys(extractedPendleParamsSchema)}
</keys>

<output>
${formatZodOutput(extractedPendleParamsSchema)}

CRITICAL: Your response must contain ONLY the JSON object, no explanations or additional text.
</output>`;
