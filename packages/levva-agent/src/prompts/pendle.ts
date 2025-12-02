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
          "Can be inferred from pendleToken if pendleToken is explicitly specified. " +
          "Return null if pendleToken is not specified or cannot be determined."
      ),
    pendleToken: z
      .string()
      .nullable()
      .describe(
        "PT token from <pendleTokens> (e.g., 'USDe', 'WBTC', 'WETH'). User can prefix with 'PT' (e.g., 'PT USDC'), which should be stripped. " +
          "CRITICAL: Asset class alone ('stable PT', 'BTC yield') is NOT sufficient. User MUST explicitly mention specific token name. Return null if no specific token mentioned."
      ),
    userToken: z
      .string()
      .nullable()
      .describe(
        "Token to use for the transaction: " +
          "For 'buy'/'deposit': Non-PT token from <userPortfolio> that user will spend. When NOT explicitly specified, AUTO-SELECT the token with HIGHEST usdValue (compare numerically: 12.90 > 1.99). MUST exclude tokens starting with 'PT-'. " +
          "For 'sell'/'withdraw': User MUST explicitly specify Non-PT token to receive from <userPortfolio>. " +
          "CRITICAL: For buy/deposit, auto-select by highest usdValue when not specified. For sell/withdraw, return null if not specified."
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
          "For buy/deposit: Convert percentages/keywords: 50% → (0.5 × balance), 'all'/'max' → full balance. " +
          "For sell/withdraw: User MUST explicitly specify. Ignore <userPortfolio> when specifying amount. " +
          "NEVER include %, $, currency symbols, or token names in the value. " +
          "CRITICAL: Return null if user does NOT explicitly mention a specific amount, number, percentage, or keyword like 'all'/'max'. Do NOT infer, calculate, or suggest amounts."
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
Format: comma separated list of ('ptToken','class')

${ctx.pendleTokens}
</pendleTokens>
${
  ctx.userPortfolio
    ? `<userPortfolio>
Format: comma separated list of ('token','balance','usdValue')

${ctx.userPortfolio}
</userPortfolio>`
    : ""
}
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
- **CRITICAL DISTINCTION**: tokenClass and pendleToken are INDEPENDENT parameters
  * tokenClass = asset category filter (Stable/BTC/ETH) - can be mentioned by user OR inferred
  * pendleToken = specific token name or symbol (USDC/WBTC/WETH/Rocket Pool ETH) - MUST be explicitly mentioned by user
  * **tokenClass alone is NOT sufficient**: Specifying only asset class without specific token name always results in pendleToken: null
  * Examples:
    - "I want a stable PT" → tokenClass: **Stable**, pendleToken: **null** (class only, no specific token)
    - "I want PT USDC" → tokenClass: **Stable** (inferred), pendleToken: **USDC** (specific token named)
- NEVER infer or suggest pendleToken, amount, maturityDays if not explicitly specified
- EXCEPTION: userToken is AUTO-SELECTED for buy/deposit operations when not specified
- If multiple Pendle requests exist, extract parameters for the MOST RECENT uncompleted one
- **CRITICAL**: Extract parameters ONLY from USER messages, NOT from agent/Levvski responses
${ctx.intentContext ? '- Leverage intent context to resolve ambiguous references (e.g., "that token" referring to previously mentioned tokens)' : ""}

OPERATION TYPE GUIDANCE:
**CRITICAL**: User MUST use clear action verbs. Vague expressions return null.

- **buy**: User explicitly says action verbs for purchasing
  * Valid phrases: "buy PT", "purchase PT", "invest in PT", "long PT", "get PT", "acquire PT"
  * Invalid phrases: "I want PT", "explore Pendle strategies", "looking at PT" → return **null**

- **sell**: User explicitly says action verbs for selling
  * Valid phrases: "sell PT", "exit position", "redeem PT", "close position", "liquidate PT"
  * Invalid phrases: "what about my PT", "check PT value" → return **null**

- **deposit**: User explicitly says action verbs for adding liquidity
  * Valid phrases: "deposit to Pendle", "add liquidity", "LP Pendle", "provide liquidity", "stake in Pendle"
  * Invalid phrases: "tell me about liquidity", "show pools" → return **null**

- **withdraw**: User explicitly says action verbs for removing liquidity
  * Valid phrases: "withdraw from Pendle", "remove liquidity", "exit pool", "unstake", "pull out"
  * Invalid phrases: "how's my pool", "check my liquidity" → return **null**

**Examples**:
- "I want a PT" → operationType: **null** (no action verb)
- "buy PT USDC" → operationType: "buy" (clear action verb)
- "explore Pendle strategies" → operationType: **null** (no action verb)
- "sell my PT" → operationType: "sell" (clear action verb)

AMOUNT PARSING RULES:
- Extract only numeric values: "100", "0.5", "1000".
- For buy/deposit: Use <userPortfolio> "balance" field to see available balances.
- For sell/withdraw: User MUST explicitly specify Non-PT token to receive from <userPortfolio>.
- Percentage conversion: If user says "50%" → look up token in <userPortfolio>, compute 0.5 × "balance" value.
- Keyword conversion: If user says "all"/"max" → look up token in <userPortfolio>, use full "balance" value.
- Trim trailing zeros (e.g., "15.460000" → "15.46").
- If token not in portfolio or balance unavailable: Return null for amount, explain reason in thought field.
- NEVER include: %, $, currency symbols, or token symbols in the amount field.
- NEVER infer or suggest amount if not explicitly specified.

**CRITICAL NOTE on usdValue comparisons**:
- The "usdValue" field is a STRING but represents a DECIMAL NUMBER
- When comparing usdValues, convert to numbers FIRST: "12.90" (number: 12.90) > "1.99" (number: 1.99)
- Example: ("USDe","1.995","1.99") has usdValue "1.99" = 1.99 as a number
- Example: ("ETH","0.0044","12.90") has usdValue "12.90" = 12.90 as a number
- 12.90 > 1.99, so ETH should be selected

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
**CRITICAL**: tokenClass alone is NOT sufficient to select a token. Specific token name is always required for pendleToken.

- **Asset Classes**:
  * **"Stable"**: Stablecoins (e.g. USDC, USDe, DAI, USDT, etc.)
  * **"BTC"**: Bitcoin-backed assets (e.g. WBTC, tBTC, etc.)
  * **"ETH"**: Ethereum-backed assets (e.g. WETH, stETH, wstETH, rETH, etc.)

- **Extraction Rules**:
  * Extract tokenClass when user mentions asset type/category: "stable", "stablecoin", "BTC", "bitcoin", "ETH", "ethereum"
  * Common phrases: "stable PT", "BTC yield", "ETH yield", "USD yield" → extract tokenClass
  * Can be inferred from pendleToken when pendleToken is explicitly specified
  * tokenClass is INDEPENDENT from pendleToken - they are separate parameters

- **CRITICAL**: Asset class only (no specific token) → pendleToken must be null
  * "I want a stable PT" → tokenClass: "Stable", pendleToken: **null** (only class specified)
  * "I want BTC yield" → tokenClass: "BTC", pendleToken: **null** (only class specified)
  * "I want PT WBTC" → tokenClass: "BTC" (inferred), pendleToken: "WBTC" (specific token named)

TOKEN SELECTION GUIDANCE:

**pendleToken** (PT token for the transaction):
  * MUST match a "ptToken" value from <pendleTokens> list
  * **USER** MUST explicitly say the token name in THEIR OWN messages (e.g., "USDC", "USDe", "WETH")
  * **Strip descriptive keywords before matching**:
    - Remove "PT", "PT-" prefix: "PT USDC" → "USDC", "PT-USDC" → "USDC"
    - Remove "Pendle" keyword: "Pendle USDC" → "USDC", "buy Pendle USDe" → "USDe"
    - Remove "LP" keyword: "LP USDC" → "USDC", "deposit into LP yoUSD" → "yoUSD"
    - Combined: "buy Pendle PT USDC" → "USDC", "LP PT-USDe" → "USDe"
  * Match case-insensitively after stripping keywords (e.g., "usdc" matches "USDC")
  * If token not in <pendleTokens> "ptToken" field, return null and explain in thought field
  * **CRITICAL**: Phrases like "you can consider PT yoUSD or PT USDX" are agent suggestions, NOT user selections - return null

**userToken** (token user will use/spend):
- **For "buy"/"deposit" operations**:
  * MUST match a "token" value from <userPortfolio> (non-PT tokens only)
  * **AUTO-SELECTION RULE**: When user does NOT specify userToken, automatically select the token with the HIGHEST usdValue
    - Compare usdValue NUMERICALLY as decimal numbers: 12.90 > 1.99 > 0.00
    - MUST exclude ALL tokens starting with "PT-"
    - Example: Portfolio [("USDe","1.995","1.99"), ("ETH","0.0044","12.90")] → select "ETH" (12.90 is highest)
    - Example: Portfolio [("USDC","3","3.00"), ("ETH","0.011","35.75"), ("PT-USDe","0.316","0.00")] → select "ETH" (35.75 is highest)
  * When user explicitly specifies userToken (e.g., "with USDC", "using ETH", "use 0.2 USDC"), ALWAYS use their specified token
  * **CRITICAL**: Explicit userToken in <currentMessage> overrides ANY previous returnData value (e.g., "use USDC instead" overrides previous "ETH")
  * Verify sufficient "balance" when amount is specified

- **For "sell"/"withdraw" operations**:
  * User MUST explicitly specify Non-PT token to receive from <userPortfolio>.
  * **CRITICAL**: Return null if user does NOT explicitly mention a specific token.

**General Rules:**
- Extract tokens ONLY when user explicitly mentions specific token names or symbols
- Asset class alone ('stable', 'BTC', 'ETH') is NOT sufficient for pendleToken - specific token name required
- NEVER infer or suggest tokens based on user's intent or class alone
- Return null for any parameter not explicitly specified (EXCEPT userToken for buy/deposit - use auto-selection)
- Verify pendleToken exists in <pendleTokens> "ptToken" field for buy/deposit
- For buy/deposit: Verify userToken exists in <userPortfolio> "token" field for all operations

**Extraction Examples:**

Given <userPortfolio>: [("USDC","3","3.00"), ("ETH","0.011","35.75"), ("PT-USDe-11DEC2025","0.316","0.00")]
Given <pendleTokens>: [("yoUSD","Stable"), ("USDX","Stable"),("mRe7BTC","BTC"),("USDC","Stable")]

- **Informational queries (all null)**:
  * "I want a PT" → operationType: null, pendleToken: null, tokenClass: null, userToken: null, amount: null
  * "interested in PT" → operationType: null, pendleToken: null, tokenClass: null, userToken: null, amount: null

- **Asset class only (pendleToken: null)**:
  * "I want a stable PT" → operationType: null, pendleToken: null, tokenClass: "Stable", userToken: null, amount: null
  * "buy stable PT" → operationType: "buy", pendleToken: null, tokenClass: "Stable", userToken: "ETH" (auto-select 35.75 > 3.00), amount: null
  * User: "deposit into Stable yield strategy", Agent: "you can consider PT yoUSD or PT USDX" → pendleToken: null (agent suggestion, not user selection!)

- **Buy with auto-selected userToken** (userToken not specified → select highest usdValue):
  * "buy PT" → operationType: "buy", pendleToken: null, tokenClass: null, userToken: "ETH" (auto-select: 35.75 is highest), amount: null
  * "buy PT USDC" → operationType: "buy", pendleToken: "USDC", tokenClass: "Stable", userToken: "ETH" (auto-select: 35.75 > 3.00), amount: null
  * "buy 100 PT USDC" → operationType: "buy", pendleToken: "USDC", tokenClass: "Stable", userToken: "ETH" (auto-select: 35.75 is highest), amount: "100"
  * "buy mRe7BTC pt" → operationType: "buy", pendleToken: "mRe7BTC", tokenClass: "BTC", userToken: "ETH" (auto-select: 35.75 > 3.00), amount: null

- **Buy with explicit userToken** (userToken specified by user):
  * "buy 100 PT USDC with USDC" → operationType: "buy", pendleToken: "USDC", tokenClass: "Stable", userToken: "USDC" (explicit), amount: "100"
  * "buy PT USDC using ETH" → operationType: "buy", pendleToken: "USDC", tokenClass: "Stable", userToken: "ETH" (explicit), amount: null
  * "use 0.2 USDC from my wallet" (when returnData has userToken: "ETH") → userToken: "USDC" (explicit override), amount: "0.2"

- **Sell operations**:
  * "sell my PT-WBTC" → operationType: "sell", userToken: null, pendleToken: "WBTC", tokenClass: "BTC"
  * "sell PT-USDe for USDC" → operationType: "sell", userToken: USDC, pendleToken: "USDe", tokenClass: "Stable"

- **Ignoring agent responses and filtered markets**:
  * User: "maturity >90 days", Agent: "consider PT yoUSD or PT USDX", User: "Use 5 ETH" → pendleToken: null (ignore agent suggestions!)
  * User: "I choose PT yoUSD" → pendleToken: "yoUSD" (user explicitly selected!)
  * User: "i want to buy pt yousd" → pendleToken: "yoUSD" (case-insensitive match: "yousd" matches "yoUSD")

- **Maturity preference preservation**:
  * User: "ETH yield for 30-90 days", then "select wcgUSD (maturity: 2025-12-18)" → maturityDays: "30-90" (use stated preference, not calculated date)
  * User: "invest long term", then "PT USDC maturing 2026-03-26" → maturityDays: ">90" (both indicate same category)
  * User: "short term yield", then "I choose PT with maturity 2025-12-18" → maturityDays: "<=30" (use stated preference if within same intent)

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
