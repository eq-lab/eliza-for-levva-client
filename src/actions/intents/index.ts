/**
 * Intent handlers for the Levva agent actions
 *
 * This module exports all intent handlers for use by actions.
 * Intent handlers provide specialized logic for handling specific user intents
 * within different action domains.
 *
 * Intent handlers are organized under actions since they are closely related to
 * action execution and provide specialized behavior for specific user intents.
 *
 * Note: Intent registration is done in the respective action files that use
 * these handlers, not here.
 */

// Export intent handlers for use by actions
export { handleWithdrawIntent, generateWithdrawSuggestions } from "./withdraw";
export {
  handleSwapIntent,
  generateSwapSuggestions,
  onSwapSuccess,
} from "./swap";
export {
  handleDepositIntent,
  generateDepositSuggestions,
  onDepositSuccess,
} from "./deposit";
export {
  handleSendIntent,
  generateSendSuggestions,
  onSendSuccess,
} from "./send";
