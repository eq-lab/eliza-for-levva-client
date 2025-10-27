/**
 * Prompt helper functions index
 *
 * @version 1.0.0
 * @lastModified 2025-01-XX
 *
 * This module exports reusable helper functions for prompt generation,
 * reducing duplication across intent-aware and action-based suggestion prompts.
 */

// Intent suggestion base helpers
export {
  generateDecisionSection,
  generateIntentContextSection,
  generateCommonInstructions,
  generateOutputFormat,
  buildProgressiveDisclosurePrompt,
  generateMissingParametersSection,
  ETH_WETH_CONVERSION_NOTE,
  CONFIDENCE_SCORING_GUIDE,
  type BaseIntentSuggestionConfig,
  type ProgressiveStepConfig,
} from "./intent-suggestion-base";

// Token selection helpers
export {
  formatWalletAssetsForPrompt,
  checkEthWethAvailability,
  generateEthWethConversionNote,
  generateAvailableTokensSection,
  getTokensWithBalance,
  sortTokensByPriority,
  ETH_WETH_GUIDANCE,
  type WalletAsset,
  type TokenInfo,
  type TokenSelectionConfig,
} from "./token-selection";

// Amount suggestion helpers
export {
  calculateAmountsFromBalance,
  generateAmountContext,
  generateAmountSuggestionsInstructions,
  STANDARD_AMOUNT_PERCENTAGES,
  NATIVE_TOKEN_PERCENTAGES,
  type CalculatedAmounts,
} from "./amount-suggestions";
