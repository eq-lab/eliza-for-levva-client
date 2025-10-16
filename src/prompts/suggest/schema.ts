/**
 * Shared schema for suggestion generation
 *
 * @version 1.1.0
 * @lastModified 2025-01-XX
 * @changes v1.1.0: Added suggestionTypeSchema for action-based suggestion type selection
 * @changes v1.0.0: Initial creation - extracted from default.ts for reuse across all suggestion generators
 */

import { z } from "zod";

/**
 * Default suggestion schema used by all suggestion generators
 * Ensures consistent output format across intent-based, action-based, and default suggestions
 */
export const defaultSuggestionSchema = z.object({
  thought: z
    .string()
    .describe(
      "Your internal reasoning about what suggestions to provide and why"
    ),
  suggestions: z
    .array(
      z.object({
        label: z
          .string()
          .describe(
            "Short, specific label for the button/chip UI element (2-5 words). Must clearly indicate what the suggestion does. Examples: 'Withdraw 100 USDC' (NOT 'Edit amount'), '50% of balance' (NOT 'Partial'), 'Safe yield strategy' (NOT 'Different strategy'), 'Cancel withdrawal'"
          ),
        text: z
          .string()
          .describe(
            "The complete natural message that the USER would type or say to the agent (e.g., 'I want to withdraw 100 USDC', 'Actually, withdraw 50 USDC instead', 'Cancel this withdrawal')"
          ),
      })
    )
    .describe(
      "Array of 3-6 suggestion objects, each containing both a label and text field"
    ),
});

export type DefaultSuggestionResult = z.infer<typeof defaultSuggestionSchema>;

/**
 * Suggestion type selection schema for action-based suggestions
 * Used to determine which suggestion type to use based on conversation context
 */
export const suggestionTypeSchema = z.object({
  thought: z
    .string()
    .describe(
      "Your analysis of the conversation context and what the user needs next"
    ),
  type: z
    .string()
    .describe(
      "The exact name of the suggestion type to use from the available options (must match one of the provided type names exactly)"
    ),
  known: z
    .record(z.any())
    .describe(
      "JSON object containing data already provided by the user in the conversation (e.g., {amount: '100', token: 'USDC'})"
    ),
  unknown: z
    .array(z.string())
    .describe(
      "Array of parameter names that still need to be collected from the user (e.g., ['strategyId', 'leverage'])"
    ),
});

export type SuggestionTypeResult = z.infer<typeof suggestionTypeSchema>;
