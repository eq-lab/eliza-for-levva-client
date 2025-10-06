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

// Swap action suggestions (help initiate SWAP intent)
export {
  exchangeAmountPrompt,
  type ExchangeAmountParams,
} from "./exchange-amount";
export {
  exchangePairsPrompt,
  type ExchangePairsParams,
} from "./exchange-pairs";

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
