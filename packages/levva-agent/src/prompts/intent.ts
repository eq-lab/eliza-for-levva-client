/**
 * Intent detection prompt for LLM-based intent analysis
 *
 * @version 2.0.0
 * @lastModified 2025-01-29
 * @changes v2.0.0: Migrated to Zod schema for structured output
 * @changes v1.0.0: Initial implementation with DataDescription
 */

import { z } from "zod";
import { LEVVA_ACTIONS, INTENT_TYPE } from "../constants/enum";
import { formatZodKeys, formatZodOutput } from "./util";

export interface IntentOption {
  type: INTENT_TYPE;
  description: string;
  keywords: string[];
}

/** Zod schema for intent detection analysis */
export const intentAnalysisSchema = z
  .object({
    selectedIntent: z
      .string()
      .nullable()
      .describe(
        "The most appropriate intent type from available options, or null if none match. " +
          "Must be one of the provided intent types or null."
      ),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Confidence score from 0 to 1. " +
          "High (0.8-1.0): Clear intent from context AND explicit action keywords. " +
          "Medium (0.6-0.75): Some action indication but ambiguous. " +
          "Low (0.3-0.5): Informational request, not an action. " +
          "Very Low (0.0-0.2): No intent indication."
      ),
    extractedValues: z
      .record(z.any())
      .describe(
        "Any values extracted from the message for this intent. " +
          "Return empty object {} if no values extracted."
      ),
    reasoning: z
      .string()
      .describe(
        "Brief explanation of the decision. " +
          "Explain why this intent was selected (or not selected) and confidence level."
      ),
  })
  .describe("Intent detection analysis result");

/** Intent analysis type inferred from Zod schema */
export type IntentAnalysis = z.infer<typeof intentAnalysisSchema>;

/**
 * @deprecated Legacy interface for backward compatibility. Use IntentAnalysis instead.
 */
export interface LLMIntentAnalysis {
  selectedIntent: INTENT_TYPE | undefined;
  confidence: number;
  extractedValues: Record<string, any>;
  reasoning: string;
}

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
0. **CRITICAL RULE**: Informational requests are NOT intents
   - "Analyze", "Show", "Review", "Check", "Display", "Tell me", "What" → NO INTENT (return undefined)
   - These words mean the user wants INFORMATION, not to perform a transaction
   - Even if the domain is ANALYZE_WALLET, this does NOT mean every message should be a SEND intent
   - Return undefined for informational requests, even if they mention "wallet" or "portfolio"

1. **Context Analysis**: Use conversation context to understand what the agent was asking for
   - If agent asked "What amount would you like to deposit?" and user responds with a number → DEPOSIT intent
   - If agent asked "How much would you like to withdraw?" and user responds with a number → WITHDRAW intent
   - If agent asked about strategy selection and user responds → DEPOSIT intent (for investment)

2. **Message Analysis**: Analyze the user's current message for explicit intent keywords
   - Look for direct ACTION words (deposit, withdraw, swap, send, etc.)
   - "Review", "check", "show", "view", "analyze", "display", "tell me" alone are NOT action words - they are informational requests
   - "Analyze my wallet" or "Analyze my portfolio" = informational, NOT a send/transfer action
   - Only trigger intents when user clearly expresses desire to PERFORM an action (not just view information)
   - Consider the context of numbers and amounts based on what was previously asked

2.5. **CANCEL/ABORT DETECTION** (CRITICAL):
   - If user says "cancel", "nevermind", "stop", "abort", "forget it", "no", "don't" → return undefined, confidence < 0.2
   - These are cancellation requests, NOT new action intents
   - Even if previous conversation mentioned positions/withdrawals/deposits, cancellation is not an intent
   - User canceling a transaction does NOT mean they want to withdraw or perform any other action

3. **Intent Selection**: Select the most appropriate intent from available options
   - BE CONSERVATIVE: Only create intents when user clearly wants to perform a transaction
   - Prioritize conversation context over isolated message analysis
   - If user provides requested information (amount, strategy, etc.), continue the active flow
   - Return undefined if the message is informational (review, check, show status)
   
   **NEGATIVE EXAMPLES** (return selectedIntent: undefined, confidence < 0.3):
   - "Analyze my wallet" → selectedIntent: undefined, confidence: 0.2
   - "Analyze my portfolio" → selectedIntent: undefined, confidence: 0.2
   - "Show me my assets" → selectedIntent: undefined, confidence: 0.2
   - "Check my balance" → selectedIntent: undefined, confidence: 0.2
   - "Review my positions" → selectedIntent: undefined, confidence: 0.2
   - "What do I have?" → selectedIntent: undefined, confidence: 0.2
   - "Display my holdings" → selectedIntent: undefined, confidence: 0.2
   
   **POSITIVE EXAMPLES** (these should trigger intents with high confidence):
   - "Send 10 USDC to 0x..." → SEND intent, confidence 0.9
   - "I want to withdraw from my position" → WITHDRAW intent, confidence 0.85
   - "Deposit into ultra-safe strategy" → DEPOSIT intent, confidence 0.9
   - "Swap 100 USDC for ETH" → SWAP intent, confidence 0.9

4. **Confidence Scoring**: 
   - High (0.8-1.0): Clear intent from context AND explicit action keywords (e.g., "withdraw 100 USDC")
   - Medium (0.6-0.75): Some action indication but ambiguous (use confidence < 0.75 for these)
   - Low (0.3-0.5): Informational request, not an action (e.g., "show positions", "check status")
   - Very Low (0.0-0.2): No intent indication

**CRITICAL**: These are INFORMATIONAL requests, NOT action intents (confidence < 0.5):
   - "Review my positions"
   - "Show my portfolio"
   - "Check my status"
   - "Analyze my wallet"
   - "Analyze my portfolio"
   - "Display my assets"

5. **Value Extraction**: Extract relevant parameters (amounts, tokens, addresses, etc.)

6. **Flow Continuity**: Favor continuing existing conversation flows over starting new ones

**FINAL CHECK** before selecting an intent:
- Does the message contain an ACTION VERB from the keywords (send, transfer, deposit, withdraw, swap)?
- If NO action verb → return selectedIntent: undefined, confidence < 0.3
- If message starts with "Analyze", "Show", "Review", "Check", "Display" → return selectedIntent: undefined, confidence < 0.3
- Only return a specific intent type if you're CERTAIN the user wants to PERFORM a transaction

**REMINDER**: It is VALID and CORRECT to return selectedIntent: null
- Most messages should return null (informational requests)
- Only clear action requests should return a specific intent type
</instructions>
<keys>
${formatZodKeys(intentAnalysisSchema)}
</keys>
<output>
${formatZodOutput(intentAnalysisSchema)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
