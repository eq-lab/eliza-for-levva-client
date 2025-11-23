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
          "CRITICAL: Asset class alone ('stable PT', 'BTC yield') is NOT sufficient. User MUST explicitly mention specific token name or symbol. Return null if no specific token mentioned."
      ),
    tokenIn: z
      .string()
      .nullable()
      .describe(
        "Token to use for the transaction:\n" +
          "- For 'buy'/'deposit': Non-PT token from <userPortfolio> that user will spend. When NOT explicitly specified, AUTO-SELECT the token with HIGHEST usdValue (compare numerically: 12.90 > 1.99). MUST exclude tokens starting with 'PT-'.\n" +
          "- For 'sell'/'withdraw': PT token from <userPortfolio> to sell/burn. User MUST explicitly specify. Look for 'PT-' prefix.\n" +
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
        "Operation type - MUST be explicitly mentioned by user with clear action verbs:\n" +
          "- 'buy': User says 'buy', 'purchase', 'long', 'invest in', 'get PT'\n" +
          "- 'sell': User says 'sell', 'exit', 'close position', 'redeem PT'\n" +
          "- 'deposit': User says 'deposit', 'add liquidity', 'provide liquidity', 'LP'\n" +
          "- 'withdraw': User says 'withdraw', 'remove liquidity', 'exit pool', 'unstake'\n" +
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
<supportedTokens>
Format: comma separated list of ("ptToken","class","maturity")

${ctx.pendleTokens}
</supportedTokens>
${
  ctx.userPortfolio
    ? `<userPortfolio>
Format: comma separated list of ("token","balance","usdValue")

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
- Ignore messages for transactions that are either canceled or confirmed
- Extract these parameters for the Pendle transaction:
  * **tokenOut**: PT token's underlying asset from <supportedTokens> "ptToken" field - MUST be explicitly specified
  * **tokenIn**: Token to spend from <userPortfolio> "token" field - AUTO-SELECT for buy/deposit if not specified
  * **amountIn**: How much tokenIn to use - MUST be explicitly specified
  * **maturityDays**: Maturity timeframe category - MUST be explicitly specified
  * **type**: Operation type (buy/sell/deposit/withdraw) - MUST use clear action verbs
  * **tokenClass**: Asset category from <supportedTokens> "class" field OR inferred from tokenOut
- **CRITICAL DISTINCTION**: tokenClass and tokenOut are INDEPENDENT parameters
  * tokenClass = asset category filter (Stable/BTC/ETH) - can be mentioned by user OR inferred
  * tokenOut = specific token symbol (USDC/WBTC/WETH) - MUST be explicitly mentioned by user
  * **tokenClass alone is NOT sufficient**: Specifying only asset class without specific token name always results in tokenOut: null
  * Examples:
    - "I want a stable PT" → tokenClass: **Stable**, tokenOut: **null** (class only, no specific token)
    - "I want PT USDC" → tokenClass: **Stable** (inferred), tokenOut: **USDC** (specific token named)
- NEVER infer or suggest tokenOut, amountIn, maturityDays if not explicitly specified
- EXCEPTION: tokenIn is AUTO-SELECTED for buy/deposit operations when not specified
- If multiple Pendle requests exist, extract parameters for the MOST RECENT uncompleted one
- Handle common aliases: "PT USDe" = tokenOut: "USDe", "buy principal tokens" = type: "buy"
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
- "I want a PT" → type: **null** (no action verb)
- "buy PT USDC" → type: "buy" (clear action verb)
- "explore Pendle strategies" → type: **null** (no action verb)
- "sell my PT" → type: "sell" (clear action verb)

AMOUNT PARSING RULES:
- Extract only numeric values: "100", "0.5", "1000"
- Use <userPortfolio> "balance" field to see available balances
- Percentage conversion: If user says "50%" → look up token in <userPortfolio>, compute 0.5 × "balance" value
- Keyword conversion: If user says "all"/"max" → look up token in <userPortfolio>, use full "balance" value
- Trim trailing zeros (e.g., "15.460000" → "15.46")
- If token not in portfolio or balance unavailable: Return null for amountIn, explain reason in thought field
- NEVER include: %, $, currency symbols, or token symbols in the amountIn field
- NEVER infer or suggest amountIn if not explicitly specified

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
**CRITICAL**: tokenClass alone is NOT sufficient to select a token. Specific token name is always required for tokenOut.

- **Asset Classes**:
  * **"Stable"**: Stablecoins (e.g. USDC, USDe, DAI, USDT, etc.)
  * **"BTC"**: Bitcoin-backed assets (e.g. WBTC, tBTC, etc.)
  * **"ETH"**: Ethereum-backed assets (e.g. WETH, stETH, wstETH, rETH, etc.)

- **Extraction Rules**:
  * Extract tokenClass when user mentions asset type/category: "stable", "stablecoin", "BTC", "bitcoin", "ETH", "ethereum"
  * Common phrases: "stable PT", "BTC yield", "ETH yield", "USD yield" → extract tokenClass
  * Can be inferred from tokenOut when tokenOut is explicitly specified
  * tokenClass is INDEPENDENT from tokenOut - they are separate parameters

- **CRITICAL**: Asset class only (no specific token) → tokenOut must be null
  * "I want a stable PT" → tokenClass: "Stable", tokenOut: **null** (only class specified)
  * "I want BTC yield" → tokenClass: "BTC", tokenOut: **null** (only class specified)
  * "I want PT WBTC" → tokenClass: "BTC" (inferred), tokenOut: "WBTC" (specific token named)

TOKEN SELECTION GUIDANCE:

**tokenOut** (PT token for the transaction):
- **For "buy"/"deposit" operations**:
  * MUST match a "ptToken" value from <supportedTokens> list
  * **USER** MUST explicitly say the token name in THEIR OWN messages (e.g., "USDC", "USDe", "WETH")
  * User can prefix with "PT" (e.g., "PT USDC" → "USDC")
  * Match case-insensitively (e.g., "usdc" matches "USDC")
  * If token not in <supportedTokens> "ptToken" field, return null and explain in thought field
  * **CRITICAL**: Phrases like "you can consider PT yoUSD or PT USDX" are agent suggestions, NOT user selections - return null

- **For "sell"/"withdraw" operations**:
  * Non-PT token from <userPortfolio> to receive (e.g., "USDC", "ETH")
  * Only extract if user explicitly specifies
  * Common case: user sells PT-USDe to receive USDC/USDe
  * If not specified, return null (backend will use underlying asset)

**tokenIn** (token user will use/spend):
- **For "buy"/"deposit" operations**:
  * MUST match a "token" value from <userPortfolio> (non-PT tokens only)
  * **AUTO-SELECTION RULE**: When user does NOT specify tokenIn, automatically select the token with the HIGHEST usdValue
    - Compare usdValue NUMERICALLY as decimal numbers: 12.90 > 1.99 > 0.00
    - MUST exclude ALL tokens starting with "PT-"
    - Example: Portfolio [("USDe","1.995","1.99"), ("ETH","0.0044","12.90")] → select "ETH" (12.90 is highest)
    - Example: Portfolio [("USDC","3","3.00"), ("ETH","0.011","35.75"), ("PT-USDe","0.316","0.00")] → select "ETH" (35.75 is highest)
  * When user explicitly specifies tokenIn (e.g., "with USDC", "using ETH", "use 0.2 USDC"), ALWAYS use their specified token
  * **CRITICAL**: Explicit tokenIn in <currentMessage> overrides ANY previous returnData value (e.g., "use USDC instead" overrides previous "ETH")
  * Verify sufficient "balance" when amountIn is specified

- **For "sell"/"withdraw" operations**:
  * PT token from <userPortfolio> to sell/burn
  * MUST match a "token" value from <userPortfolio> with "PT-" prefix
  * User MUST explicitly specify which PT token to sell
  * If not specified, return null

**General Rules:**
- Extract tokens ONLY when user explicitly mentions specific token names or symbols
- Asset class alone ('stable', 'BTC', 'ETH') is NOT sufficient for tokenOut - specific token name required
- NEVER infer or suggest tokens based on user's intent or class alone
- Return null for any parameter not explicitly specified (EXCEPT tokenIn for buy/deposit - use auto-selection)
- Verify tokenOut exists in <supportedTokens> "ptToken" field for buy/deposit
- Verify tokenIn exists in <userPortfolio> "token" field for all operations

**Extraction Examples:**

Given <userPortfolio>: [("USDC","3","3.00"), ("ETH","0.011","35.75"), ("PT-USDe-11DEC2025","0.316","0.00")]

- **Informational queries (all null)**:
  * "I want a PT" → type: null, tokenOut: null, tokenClass: null, tokenIn: null, amountIn: null
  * "interested in PT" → type: null, tokenOut: null, tokenClass: null, tokenIn: null, amountIn: null

- **Asset class only (tokenOut: null)**:
  * "I want a stable PT" → type: null, tokenOut: null, tokenClass: "Stable", tokenIn: null, amountIn: null
  * "buy stable PT" → type: "buy", tokenOut: null, tokenClass: "Stable", tokenIn: "ETH" (auto-select 35.75 > 3.00), amountIn: null
  * User: "deposit into Stable yield strategy", Agent: "you can consider PT yoUSD or PT USDX" → tokenOut: null (agent suggestion, not user selection!)

- **Buy with auto-selected tokenIn** (tokenIn not specified → select highest usdValue):
  * "buy PT" → type: "buy", tokenOut: null, tokenClass: null, tokenIn: "ETH" (auto-select: 35.75 is highest), amountIn: null
  * "buy PT USDC" → type: "buy", tokenOut: "USDC", tokenClass: "Stable", tokenIn: "ETH" (auto-select: 35.75 > 3.00), amountIn: null
  * "buy 100 PT USDC" → type: "buy", tokenOut: "USDC", tokenClass: "Stable", tokenIn: "ETH" (auto-select: 35.75 is highest), amountIn: "100"
  * "buy mRe7BTC pt" → type: "buy", tokenOut: "mRe7BTC", tokenClass: "BTC", tokenIn: "ETH" (auto-select: 35.75 > 3.00), amountIn: null

- **Buy with explicit tokenIn** (tokenIn specified by user):
  * "buy 100 PT USDC with USDC" → type: "buy", tokenOut: "USDC", tokenClass: "Stable", tokenIn: "USDC" (explicit), amountIn: "100"
  * "buy PT USDC using ETH" → type: "buy", tokenOut: "USDC", tokenClass: "Stable", tokenIn: "ETH" (explicit), amountIn: null
  * "use 0.2 USDC from my wallet" (when returnData has tokenIn: "ETH") → tokenIn: "USDC" (explicit override), amountIn: "0.2"

- **Sell operations**:
  * "sell my PT-WBTC" → type: "sell", tokenIn: "PT-WBTC", tokenOut: null, tokenClass: "BTC"
  * "sell PT-USDe for USDC" → type: "sell", tokenIn: "PT-USDe", tokenOut: "USDC", tokenClass: "Stable"

- **Ignoring agent responses and filtered markets**:
  * User: "maturity >90 days", Agent: "consider PT yoUSD or PT USDX", User: "Use 5 ETH" → tokenOut: null (ignore agent suggestions!)
  * User: "I choose PT yoUSD" → tokenOut: "yoUSD" (user explicitly selected!)

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
