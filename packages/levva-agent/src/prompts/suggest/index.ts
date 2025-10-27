// ============================================================================
// INTENT-AWARE SUGGESTIONS (Active Intent Context)
// ============================================================================
// These are used when an intent is ACTIVE and provide progressive disclosure

export {
  generateWithdrawIntentSuggestionsPrompt,
  type WithdrawIntentSuggestionParams,
} from "./withdraw-intent";

export {
  generateDepositIntentSuggestionsPrompt,
  type DepositIntentSuggestionParams,
} from "./deposit-intent";

export {
  generateSwapIntentSuggestionsPrompt,
  type SwapIntentSuggestionParams,
} from "./swap-intent";

export {
  generateSendIntentSuggestionsPrompt,
  type SendIntentSuggestionParams,
} from "./send-intent";

export { generateIntentManagementSection } from "./intent-management";

// ============================================================================
// ACTION-BASED SUGGESTIONS (No Active Intent)
// ============================================================================
// These help users INITIATE intents when no intent is active

// Removed: exchange-amount.ts, exchange-pairs.ts, swap-continuation.ts
// All swap suggestions now handled by swap-intent.ts progressive disclosure system

// Position action suggestions (help initiate DEPOSIT/WITHDRAW intents)
export {
  positionManagementPrompt,
  type PositionManagementParams,
} from "./position-management";
export {
  positionDiversificationPrompt,
  type PositionDiversificationParams,
} from "./position-diversification";
export {
  depositOpportunitiesPrompt,
  type DepositOpportunitiesParams,
} from "./deposit-opportunities";

// Wallet/Portfolio analysis suggestions
// Removed filler suggestions (2025-01-07):
// - portfolio-optimization.ts → Use deposit-opportunities instead
// - investment-opportunities.ts → Use deposit-opportunities instead
// - market-insights.ts → Generic questions, no actionable insights
// - send-tokens.ts → Placeholder addresses, use send-intent instead
