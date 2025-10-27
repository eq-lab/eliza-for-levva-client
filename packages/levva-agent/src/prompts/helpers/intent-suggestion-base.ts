/**
 * Base helper functions for intent-aware suggestion generation
 *
 * @version 1.1.0
 * @lastModified 2025-01-XX
 * @changes v1.1.0: Updated generateOutputFormat to use formatZodOutput helper
 * @changes v1.0.0: Initial creation - extracted common patterns from intent suggestion prompts
 */

import { formatZodOutput } from "../util";
import { defaultSuggestionSchema } from "../suggest/schema";

export interface BaseIntentSuggestionConfig {
  intentType: string;
  conversation: string;
  userAddress: string;
  chainId: number;
}

export interface ProgressiveStepConfig {
  stepName: string;
  status: "missing" | "partial" | "complete";
  currentValues: Record<string, any>;
  missingParameters: string[];
}

/**
 * Generate decision section for intent prompts
 */
export function generateDecisionSection(config: {
  intentType: string;
  status: string;
  missingParameters?: string[];
  nextAction?: string;
}): string {
  const missing = config.missingParameters?.length
    ? `Missing: ${config.missingParameters.join(", ")}`
    : "All parameters collected";

  const decision =
    config.nextAction ||
    (config.missingParameters?.length
      ? `Select ${config.missingParameters[0]}`
      : "Confirm or edit parameters");

  return `<decision>
Intent: ${config.intentType}
Status: ${config.status}
${missing}
Decision Required: ${decision}
</decision>`;
}

/**
 * Generate base intent context section for prompts
 */
export function generateIntentContextSection(config: {
  intentType: string;
  status: string;
  userAddress: string;
  chainId: number;
  parameters: Record<string, any>;
}): string {
  const paramLines = Object.entries(config.parameters)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `<intentContext>
Intent Type: ${config.intentType}
Status: ${config.status}
User Address: ${config.userAddress}
Chain ID: ${config.chainId}
${paramLines ? `\nCurrent Parameters:\n${paramLines}` : ""}
</intentContext>`;
}

/**
 * Generate common instruction sections for intent suggestions
 */
export function generateCommonInstructions(config: {
  suggestionType: "confirmation" | "next-step" | "missing-info";
  specificInstructions: string;
  includeCancellation?: boolean;
}): string {
  const cancellationNote =
    config.includeCancellation !== false
      ? `\n**CANCELLATION OPTION:**
Always include at least one way to cancel or go back:
- "Cancel this"
- "Never mind"
- "Go back"
- "Stop"`
      : "";

  return `<instructions>
${config.specificInstructions}

**SUGGESTION GUIDELINES:**
- Be natural and conversational
- Use clear, action-oriented language
- Reference specific parameter values when appropriate
- Make suggestions contextually relevant to the conversation
${cancellationNote}
</instructions>`;
}

/**
 * Generate standard output format section using Zod schema
 *
 * Uses the shared defaultSuggestionSchema for consistent output format.
 * Note: Prompts should also pass schema to useModel for structured output:
 *
 * @example
 * import { defaultSuggestionSchema } from "../suggest/schema";
 * import { zodJsonSchema } from "../util";
 *
 * const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
 *   prompt: generateOutputFormat(),
 *   schema: zodJsonSchema(defaultSuggestionSchema),
 *   temperature: 0,
 * });
 */
export function generateOutputFormat(): string {
  return `<output>
${formatZodOutput(defaultSuggestionSchema)}

**CRITICAL REQUIREMENTS:**
1. Each suggestion MUST have BOTH "label" AND "text" fields - never omit either one
2. The "label" is a SHORT, SPECIFIC, UI-friendly description (2-5 words) that clearly indicates what the suggestion does
3. The "text" is the complete message the USER would type/say to the agent
4. The "text" field MUST be what the USER would say, NOT what the agent would respond

**CORRECT EXAMPLES:**
✅ { "label": "Withdraw 100 USDC", "text": "Actually, withdraw 100 USDC instead" }
✅ { "label": "50% of balance", "text": "Withdraw 50 USDC from Brave strategy" }
✅ { "label": "Cancel withdrawal", "text": "Cancel this withdrawal" }
✅ { "label": "Safe yield strategy", "text": "I want to deposit into the safe yield strategy" }

**WRONG EXAMPLES:**
❌ { "text": "Withdraw 100 USDC" } - Missing label field!
❌ { "label": "Withdraw" } - Missing text field!
❌ { "label": "Edit amount" } - Too vague! Should be "Withdraw 100 USDC" or "50% of balance"
❌ { "label": "Different option" } - Not specific! Should clearly state what the option is
❌ { "label": "Advice", "text": "You should consider withdrawing..." } - Text is agent advice, not user message!

Your response should include the valid JSON block and nothing else.
</output>`;
}

/**
 * Build complete progressive disclosure prompt
 */
export function buildProgressiveDisclosurePrompt(config: {
  task: string;
  intentContext: string;
  conversation: string;
  dataContext?: string;
  instructions: string;
  outputFormat?: string;
}): string {
  return `<task>${config.task}</task>
${config.intentContext}
<conversation>
${config.conversation}
</conversation>${config.dataContext ? `\n${config.dataContext}` : ""}
${config.instructions}
${config.outputFormat || generateOutputFormat()}`;
}

/**
 * Common ETH/WETH conversion note for prompts
 */
export const ETH_WETH_CONVERSION_NOTE = `
**ETH/WETH CONVERSION:**
User has ETH available. ETH can be wrapped to WETH (1:1 ratio) for DeFi strategies that require WETH. Consider suggesting both ETH and WETH options when relevant.`;

/**
 * Generate missing parameters section
 */
export function generateMissingParametersSection(
  missingParams: string[]
): string {
  if (missingParams.length === 0) return "";

  return `<missingParameters>
The following parameters still need to be provided:
${missingParams.map((p) => `- ${p}`).join("\n")}
</missingParameters>`;
}

/**
 * Standard confidence scoring guidelines (for extraction prompts)
 */
export const CONFIDENCE_SCORING_GUIDE = `
**CONFIDENCE SCORING:**
- High (0.8-1.0): All required parameters clearly specified
- Medium (0.5-0.7): Some parameters clear, others inferrable from context
- Low (0.2-0.4): Limited information, requires user clarification
- Very Low (0.0-0.1): Insufficient information to proceed`;
