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
  selectedIntent: INTENT_TYPE | undefined;
  confidence: number;
  extractedValues: Record<string, any>;
  reasoning: string;
}

const dataDescription: DataDescription<LLMIntentAnalysis> = {
  selectedIntent: {
    type: "string",
    description: "The most appropriate intent type, or undefined if none match",
    default: "undefined",
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
  domain: LEVVA_ACTIONS,
  conversationContext?: string
): string => {
  const intentList = intentOptions
    .map(
      (intent) => `- ${intent.type}: ${intent.description}
  Keywords: ${intent.keywords.join(", ")}`
    )
    .join("\n");

  const contextSection = conversationContext
    ? `<conversationContext>
${conversationContext}
</conversationContext>`
    : "";

  return `<task>
Analyze the user message and determine the most appropriate intent from the available options.
Use conversation context to understand the flow and what the agent was asking for.
</task>
<message>
${message}
</message>
<domain>
${domain}
</domain>
${contextSection}
<availableIntents>
${intentList}
</availableIntents>
<instructions>
1. **Context Analysis**: Use conversation context to understand what the agent was asking for
   - If agent asked "What amount would you like to deposit?" and user responds with a number → DEPOSIT intent
   - If agent asked "How much would you like to withdraw?" and user responds with a number → WITHDRAW intent
   - If agent asked about strategy selection and user responds → DEPOSIT intent (for investment)

2. **Message Analysis**: Analyze the user's current message for explicit intent keywords
   - Look for direct action words (deposit, withdraw, swap, send, etc.)
   - Consider the context of numbers and amounts based on what was previously asked

3. **Intent Selection**: Select the most appropriate intent from available options
   - Prioritize conversation context over isolated message analysis
   - If user provides requested information (amount, strategy, etc.), continue the active flow
   - Return null only if the message is clearly unrelated to any intent

4. **Confidence Scoring**: 
   - High (0.8-1.0): Clear intent from context or explicit keywords
   - Medium (0.6-0.7): Reasonable inference from context
   - Low (0.3-0.5): Ambiguous but some indication
   - Very Low (0.0-0.2): No clear intent indication

5. **Value Extraction**: Extract relevant parameters (amounts, tokens, addresses, etc.)

6. **Flow Continuity**: Favor continuing existing conversation flows over starting new ones
</instructions>
<keys>
${formatKeys(dataDescription)}
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
