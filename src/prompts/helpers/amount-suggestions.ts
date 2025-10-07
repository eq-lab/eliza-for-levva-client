/**
 * Amount suggestion helper for consistent amount suggestion logic
 *
 * @version 1.0.0
 * @lastModified 2025-01-XX
 * @changes Initial creation - standardized amount suggestion percentages and formatting
 */

/**
 * Standard amount suggestion percentages
 */
export const STANDARD_AMOUNT_PERCENTAGES = {
  FULL: 1.0, // 100%
  HALF: 0.5, // 50%
  QUARTER: 0.25, // 25%
  TENTH: 0.1, // 10%
};

/**
 * Amount percentages for native tokens (reserve for gas)
 */
export const NATIVE_TOKEN_PERCENTAGES = {
  NEAR_FULL: 0.95, // 95% (reserve 5% for gas)
  HALF: 0.5, // 50%
  QUARTER: 0.25, // 25%
  TENTH: 0.1, // 10%
};

/**
 * Alternative amount suggestion pattern (used in strategy prompts)
 */
export const ALTERNATIVE_PERCENTAGES = {
  FULL: 1.0, // 100%
  HIGH: 0.7, // 70%
  MEDIUM: 0.4, // 40%
  LOW: 0.1, // 10%
};

export interface AmountSuggestion {
  percentage: number;
  amount: string;
  label: string;
  description?: string;
}

export interface AmountSuggestionConfig {
  maxAmount: bigint;
  decimals: number;
  tokenSymbol: string;
  isNativeToken?: boolean;
  percentageSet?: "standard" | "native" | "alternative";
  includeMax?: boolean;
}

/**
 * Generate amount suggestions based on balance
 */
export function generateAmountSuggestions(
  config: AmountSuggestionConfig
): AmountSuggestion[] {
  const percentages = getPercentageSet(
    config.isNativeToken,
    config.percentageSet
  );

  return Object.entries(percentages).map(([key, percentage]) => {
    const amount = calculateAmount(
      config.maxAmount,
      percentage,
      config.decimals
    );
    const percentLabel = `${(percentage * 100).toFixed(0)}%`;

    return {
      percentage,
      amount,
      label: `${formatAmountForDisplay(amount, config.decimals)} ${config.tokenSymbol}`,
      description: `${percentLabel} of available balance`,
    };
  });
}

/**
 * Get appropriate percentage set
 */
function getPercentageSet(
  isNativeToken?: boolean,
  preferredSet?: "standard" | "native" | "alternative"
): Record<string, number> {
  if (preferredSet === "alternative") {
    return ALTERNATIVE_PERCENTAGES;
  }

  if (preferredSet === "native" || isNativeToken) {
    return NATIVE_TOKEN_PERCENTAGES;
  }

  return STANDARD_AMOUNT_PERCENTAGES;
}

/**
 * Calculate amount from percentage
 */
function calculateAmount(
  maxAmount: bigint,
  percentage: number,
  decimals: number
): string {
  const amount =
    (maxAmount * BigInt(Math.floor(percentage * 1000000))) / 1000000n;
  return formatTokenAmount(amount, decimals);
}

/**
 * Format token amount to string with proper decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === 0n) {
    return wholePart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  const trimmedFractional = fractionalStr.replace(/0+$/, "");

  return `${wholePart}.${trimmedFractional}`;
}

/**
 * Format amount for display (trimmed, up to 6 decimals)
 */
export function formatAmountForDisplay(
  amount: string,
  maxDecimals: number = 6
): string {
  const [whole, fractional] = amount.split(".");

  if (!fractional) return whole;

  const trimmed = fractional.slice(0, maxDecimals).replace(/0+$/, "");

  return trimmed ? `${whole}.${trimmed}` : whole;
}

/**
 * Generate amount suggestions instruction section for prompts
 */
export function generateAmountSuggestionsInstructions(config: {
  tokenSymbol: string;
  isNativeToken?: boolean;
}): string {
  const percentages = config.isNativeToken
    ? "95% (reserve gas), 50%, 25%, 10%"
    : "100%, 50%, 25%, 10%";

  const gasNote = config.isNativeToken
    ? "\n- For native tokens (ETH), suggest 95% not 100% to reserve gas"
    : "";

  return `**AMOUNT SUGGESTIONS:**
- Generate suggestions for: ${percentages}
- Show trimmed amounts in labels (max 6 decimals)
- Use full precision in text for transaction accuracy${gasNote}
- Prioritize amounts user can actually afford
- Consider gas costs in calculations`;
}

/**
 * Validate amount against balance
 */
export function validateAmount(
  amountStr: string,
  maxAmount: bigint,
  decimals: number
): {
  isValid: boolean;
  error?: string;
  parsedAmount?: bigint;
} {
  try {
    // Parse amount string to bigint
    const [whole, fractional = ""] = amountStr.split(".");
    const paddedFractional = fractional
      .padEnd(decimals, "0")
      .slice(0, decimals);
    const amountBigInt = BigInt(whole + paddedFractional);

    if (amountBigInt > maxAmount) {
      return {
        isValid: false,
        error: "Amount exceeds available balance",
      };
    }

    if (amountBigInt <= 0n) {
      return {
        isValid: false,
        error: "Amount must be greater than zero",
      };
    }

    return {
      isValid: true,
      parsedAmount: amountBigInt,
    };
  } catch (error) {
    return {
      isValid: false,
      error: "Invalid amount format",
    };
  }
}

/**
 * Parse percentage or keyword to decimal
 */
export function parsePercentageOrKeyword(input: string): number | null {
  const normalized = input.toLowerCase().trim();

  // Handle keywords
  if (
    normalized === "all" ||
    normalized === "max" ||
    normalized === "everything"
  ) {
    return 1.0;
  }

  if (normalized === "half") {
    return 0.5;
  }

  // Handle percentage (e.g., "50%", "50 percent")
  const percentMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (percentMatch) {
    const value = parseFloat(percentMatch[1]);
    return value > 1 ? value / 100 : value;
  }

  return null;
}

/**
 * Convert percentage amount to absolute amount string
 */
export function convertPercentageToAmount(
  percentage: number,
  balance: bigint,
  decimals: number
): string {
  const amount =
    (balance * BigInt(Math.floor(percentage * 1000000))) / 1000000n;
  return formatTokenAmount(amount, decimals);
}
