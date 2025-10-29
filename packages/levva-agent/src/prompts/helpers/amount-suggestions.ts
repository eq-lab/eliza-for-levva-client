/**
 * Universal amount suggestion helper for consistent amount calculations across all intents
 *
 * @version 2.0.0
 * @lastModified 2025-01-XX
 * @changes v2.0.0: Refactored based on deposit-intent pattern with native token gas reservation
 * @changes v1.0.0: Initial creation
 */

import { formatUnits } from "viem";
import { ETH_NULL_ADDR } from "../../constants/eth";

/**
 * Standard amount suggestion percentages for ERC-20 tokens
 */
export const STANDARD_AMOUNT_PERCENTAGES = {
  FULL: 1.0, // 100%
  HIGH: 0.75, // 75%
  MEDIUM: 0.5, // 50%
  LOW: 0.25, // 25%
} as const;

/**
 * Amount percentages for native tokens (reserve for gas)
 */
export const NATIVE_TOKEN_PERCENTAGES = {
  FULL: 0.95, // 95% (reserve 5% for gas)
  HIGH: 0.75, // 75%
  MEDIUM: 0.5, // 50%
  LOW: 0.25, // 25%
} as const;

export interface CalculatedAmounts {
  fullAmount: string;
  amount75: string;
  amount50: string;
  amount25: string;
  isNativeToken: boolean;
  hasBalance: boolean;
}

/**
 * Calculate amount suggestions from balance using deposit-intent pattern
 *
 * @param balance - Token balance (bigint for wallet assets, number for position balances)
 * @param decimals - Token decimals (required for bigint, defaults to 6 for number)
 * @param tokenAddress - Token address to detect native ETH for gas reservation
 * @returns Calculated amounts with proper formatting
 *
 * @example
 * // For bigint wallet balance (e.g., USDC with 6 decimals)
 * const amounts = calculateAmountsFromBalance(1500000n, 6, "0x...");
 * // Returns: { fullAmount: "1.5", amount75: "1.125", amount50: "0.75", amount25: "0.375", ... }
 *
 * @example
 * // For native ETH (gas reservation)
 * const amounts = calculateAmountsFromBalance(1000000000000000000n, 18, ETH_NULL_ADDR);
 * // Returns: { fullAmount: "0.95", ... } - reserves 5% for gas
 *
 * @example
 * // For number position balance (with decimals)
 * const amounts = calculateAmountsFromBalance(100.5, 6, "0x...");
 * // Returns: { fullAmount: "100.5", amount75: "75.375", ... }
 */
export function calculateAmountsFromBalance(
  balance: bigint | number,
  decimals?: number,
  tokenAddress?: string
): CalculatedAmounts {
  // Detect native token for gas reservation
  const isNativeToken = tokenAddress === ETH_NULL_ADDR;

  // Choose percentages based on token type
  const percentages = isNativeToken
    ? NATIVE_TOKEN_PERCENTAGES
    : STANDARD_AMOUNT_PERCENTAGES;

  // Handle empty balance
  if (
    (typeof balance === "bigint" && balance === 0n) ||
    (typeof balance === "number" && balance === 0)
  ) {
    return {
      fullAmount: "",
      amount75: "",
      amount50: "",
      amount25: "",
      isNativeToken,
      hasBalance: false,
    };
  }

  let balanceFloat: number;
  let formatDecimals: number;

  // Convert balance to float based on type
  if (typeof balance === "bigint") {
    if (decimals === undefined) {
      throw new Error("decimals parameter is required when balance is bigint");
    }
    balanceFloat = parseFloat(formatUnits(balance, decimals));
    formatDecimals = decimals;
  } else {
    balanceFloat = balance;
    // For number balances (positions), default to 6 decimals if not provided
    formatDecimals = decimals ?? 6;
  }

  // Check for valid balance
  if (balanceFloat <= 0) {
    return {
      fullAmount: "",
      amount75: "",
      amount50: "",
      amount25: "",
      isNativeToken,
      hasBalance: false,
    };
  }

  // Calculate amounts using percentages (matching deposit-intent pattern)
  const amounts = [
    percentages.FULL,
    percentages.HIGH,
    percentages.MEDIUM,
    percentages.LOW,
  ];

  // Use token's actual decimals for formatting, not hardcoded 6
  const calculatedAmounts = amounts.map((pct) =>
    (balanceFloat * pct).toFixed(formatDecimals)
  );

  const [fullAmount, amount75, amount50, amount25] = calculatedAmounts;

  return {
    fullAmount,
    amount75,
    amount50,
    amount25,
    isNativeToken,
    hasBalance: true,
  };
}

/**
 * Generate amount context section for prompts
 *
 * @param tokenSymbol - Token symbol to display
 * @param amounts - Calculated amounts from calculateAmountsFromBalance
 * @returns Formatted context string for inclusion in prompts
 *
 * @example
 * const context = generateAmountContext("USDC", amounts);
 * // Returns: "\nUser has 1.5 USDC available in wallet."
 */
export function generateAmountContext(
  tokenSymbol: string,
  amounts: CalculatedAmounts
): string {
  if (!amounts.hasBalance) {
    return "";
  }

  const gasNote = amounts.isNativeToken ? " (max: 95% to reserve gas)" : "";

  return `\nUser has ${amounts.fullAmount} ${tokenSymbol} available${gasNote}.`;
}

/**
 * Generate amount suggestions instructions for prompts
 *
 * @param tokenSymbol - Token symbol for suggestions
 * @param amounts - Calculated amounts from calculateAmountsFromBalance
 * @returns Formatted instructions string for LLM prompts
 *
 * @example
 * const instructions = generateAmountSuggestionsInstructions("USDC", amounts);
 */
export function generateAmountSuggestionsInstructions(
  tokenSymbol: string,
  amounts: CalculatedAmounts
): string {
  const {
    fullAmount,
    amount75,
    amount50,
    amount25,
    hasBalance,
    isNativeToken,
  } = amounts;

  const gasNote = isNativeToken
    ? "\n- For native ETH: max is 95% to reserve 5% for gas fees"
    : "";

  if (!hasBalance) {
    return `No ${tokenSymbol} balance available. User cannot proceed with this token.`;
  }

  return `CRITICAL: The token symbol is "${tokenSymbol}" - use ONLY this exact symbol, nothing else.
User has ${fullAmount} ${tokenSymbol} available${isNativeToken ? " (95% max for gas)" : ""}.

LABEL FORMAT (use specific amounts, NOT generic labels):
- "Full balance" - for ${isNativeToken ? "95% of" : "all"} ${tokenSymbol}
- "75% of balance" - for 75% of ${tokenSymbol}
- "50% of balance" - for 50% of ${tokenSymbol}
- "Partial amount" - for a smaller specific amount

TEXT FORMAT (use "${tokenSymbol}" exactly as shown and ACTUAL amounts):
- "Deposit ${fullAmount} ${tokenSymbol}" - full ${isNativeToken ? "(95%)" : ""} balance
- "I want to deposit ${amount75} ${tokenSymbol}" - 75% of balance
- "Deposit ${amount50} ${tokenSymbol}" - 50% of balance
- "Deposit ${amount25} ${tokenSymbol}" - 25% of balance
- "What amount do you recommend?" - ask for guidance

Each suggestion should:
- Be natural and conversational
- Use ONLY the token symbol "${tokenSymbol}" (no extra characters or variations)
- Provide specific amounts based on balance
- Lead to transaction creation${gasNote}`;
}
