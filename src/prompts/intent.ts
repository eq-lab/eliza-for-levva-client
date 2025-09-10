/**
 * Intent detection prompt for LLM-based intent analysis
 */

import { LEVVA_ACTIONS, INTENT_TYPE } from "../constants/enum";
import { DataDescription, formatKeys, formatOutput } from "./util";

export interface IntentOption {
  type: INTENT_TYPE;
  description: string;
  keywords: string[];
}

/**
 * Expected structure of LLM response for intent detection
 */
export interface LLMIntentAnalysis {
  selectedIntent: INTENT_TYPE | null;
  confidence: number;
  extractedValues: Record<string, any>;
  reasoning: string;
}

const dataDescription: DataDescription<LLMIntentAnalysis> = {
  selectedIntent: {
    type: "string",
    description: "The most appropriate intent type, or null if none match",
    default: "null",
  },
  confidence: {
    type: "number",
    description: "Confidence score from 0 to 1",
  },
  extractedValues: {
    type: "object",
    description: "Any values extracted from the message for this intent",
    default: "{}",
  },
  reasoning: {
    type: "string",
    description: "Brief explanation of the decision",
  },
};

export const createIntentDetectionPrompt = (
  message: string,
  intentOptions: IntentOption[],
  domain: LEVVA_ACTIONS
): string => {
  const intentList = intentOptions
    .map(
      (intent) => `- ${intent.type}: ${intent.description}
  Keywords: ${intent.keywords.join(", ")}`
    )
    .join("\n");

  return `<task>
Analyze the user message and determine the most appropriate intent from the available options.
</task>
<message>
${message}
</message>
<domain>
${domain}
</domain>
<availableIntents>
${intentList}
</availableIntents>
<instructions>
1. Analyze the user's message to understand their intention
2. Select the most appropriate intent from the available options, or null if none match well
3. Extract any relevant values from the message (amounts, strategy names, etc.)
4. Provide a confidence score (0-1) based on how well the message matches the intent
5. If confidence is below 0.6, consider returning null for selectedIntent
6. Only return specific action intents - general viewing/status requests should return null
</instructions>
<keys>
${formatKeys(dataDescription)}
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
