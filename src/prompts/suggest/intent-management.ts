/**
 * Generate intent management section for prompts
 *
 * Provides LLM with instructions for:
 * - Cancel intent options
 * - Child intent suggestions (contextually appropriate)
 */

/**
 * Generate full intent management section for prompt
 *
 * @param intentType - The current intent type (e.g., "DEPOSIT", "SWAP")
 * @param allowCancel - Whether to allow cancellation (default: true)
 * @param childIntentGuidance - Optional guidance on when to suggest child intents
 */
export function generateIntentManagementSection(
  intentType: string,
  allowCancel: boolean = true,
  childIntentGuidance?: string
): string {
  let section = "\n<intentManagement>\n";

  if (allowCancel) {
    section += `CANCEL OPTION:
Users can cancel the current ${intentType} intent at any time.
Always include at least one cancellation option in suggestions:
- "Cancel this"
- "Never mind"
- "Go back to main menu"
- "Stop this process"
`;
  }

  if (childIntentGuidance) {
    section += `\nCHILD INTENT SUGGESTIONS:
${childIntentGuidance}

Guidelines for child intent suggestions:
- Only suggest child intents when contextually appropriate
- Child intents should be quick operations (SWAP, CHECK_WALLET)
- Never suggest long operations (WITHDRAW) as child intents
- Make suggestions natural and conversational
`;
  }

  section += "</intentManagement>\n";
  return section;
}
