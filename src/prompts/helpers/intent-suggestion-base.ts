/**
 * Base helper functions for intent-aware suggestion generation
 *
 * @version 1.0.0
 * @lastModified 2025-01-XX
 * @changes Initial creation - extracted common patterns from intent suggestion prompts
 */

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
 * Generate standard output format section
 */
export function generateOutputFormat(additionalFields?: string): string {
  const baseFormat = `{
  "suggestions": [
    {
      "label": "Short descriptive label",
      "text": "Natural user message for this action"
    }
  ]${additionalFields ? `,\n${additionalFields}` : ""}
}`;

  return `<output>
Respond using JSON format like this:
${baseFormat}

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
