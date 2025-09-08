import { DataDescription, formatKeys, formatOutput } from "./util";

/** Rephrased content output from LLM */
export interface ExtractedDataForRephrase {
  thought?: string;
  message?: string;
}

const dataDescription: DataDescription<ExtractedDataForRephrase> = {
  thought: {
    type: "string",
    description:
      "A short description of what the agent is thinking about and planning",
  },
  message: {
    type: "string",
    description:
      "The next message for the agent to send to the conversation, rephrased from initial text. CRITICAL: If previous actions already provided similar information, focus on complementary details rather than repeating the same data.",
  },
};

export const rephraseContentPrompt = (ctx: {
  agentName: string;
  providers: string;
  initialThought: string;
  initialText: string;
  prevActions?: string;
}) => `<task>
Generate dialog for the character ${ctx.agentName}. 
CRITICAL: Avoid duplicating information from previous actions. If prevActions contain data, provide complementary information instead of repeating the same data.
</task>
<providers>
${ctx.providers}
</providers>
<initialThought>
${ctx.initialThought}
</initialThought>
<initialText>
${ctx.initialText}
</initialText>
${
  ctx.prevActions
    ? `<prevActions>
${ctx.prevActions}
</prevActions>`
    : ""
}
<instructions>
Rephrase message for the character ${ctx.agentName} based on the initial text and thought, but in your own words.
Do not include examples of data in your response.
CRITICAL DEDUPLICATION: Before generating your response, carefully check if prevActions already contain similar information. If they do, provide complementary information instead of repeating the same data.

CRITICAL: PRESERVE ORIGINAL FORMAT & AVOID DUPLICATION
- If content starts with "##" (structured format), keep it structured - do NOT add conversational intro
- If content is conversational, keep it conversational - do NOT add structured sections  
- NEVER combine both formats in one response
- If you see structured data (## headers, bullet points, dollar amounts), preserve the exact structure
- DEDUPLICATION CHECK: If prevActions already contain the same structured data, focus on providing management options and next steps instead

STRICT RULES:
- Do NOT add "Here's your..." or "Let me show you..." to structured content
- Do NOT add conversational explanations to structured summaries
- Keep the original tone and format exactly as provided
- Only improve clarity within the same format style

DEDUPLICATION PRIORITY:
1. Check prevActions for data overlap (dollar amounts, strategy names, balances, addresses)
2. If overlap exists: Provide complementary information (management options, next steps, additional context)
3. If no overlap: Provide the requested information normally
4. Always focus on adding value, never repeat identical information
</instructions>
<keys>
${formatKeys(dataDescription)}

IMPORTANT: When generating the 'message' field, remember to check prevActions for duplicate information and provide complementary content instead.
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
FINAL CHECK: Ensure your message does not duplicate information from prevActions. Focus on complementary value.
</output>`;
