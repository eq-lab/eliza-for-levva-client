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
      "The next message for the agent to send to the conversation, rephrased from initial text. Preserve all requested data and information while improving clarity and tone.",
  },
};

export const rephraseContentPrompt = (ctx: {
  agentName: string;
  providers?: string;
  initialThought: string;
  initialText: string;
  prevActions?: string;
}) => `<task>
Generate dialog for the character ${ctx.agentName}. 
Rephrase the initial text while preserving all requested information and data.
</task>
${
  ctx.providers
    ? `<providers>
${ctx.providers}
</providers>`
    : ""
}
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

CRITICAL: PRESERVE ORIGINAL FORMAT & CONTENT
- If content starts with "##" (structured format), keep it structured - do NOT add conversational intro
- If content is conversational, keep it conversational - do NOT add structured sections  
- NEVER combine both formats in one response
- If you see structured data (## headers, bullet points, dollar amounts), preserve the exact structure and ALL data
- Preserve all numerical values, addresses, strategy names, and balances exactly as provided

STRICT RULES:
- Do NOT add "Here's your..." or "Let me show you..." to structured content
- Do NOT add conversational explanations to structured summaries
- Keep the original tone and format exactly as provided
- Only improve clarity within the same format style
- NEVER omit or filter out requested data (positions, balances, strategies, etc.)

SMART DEDUPLICATION (Only apply when truly redundant):
1. If prevActions contain IDENTICAL structured data (same dollar amounts, same strategy names, same format), then provide complementary management options instead
2. If prevActions contain different data or no structured data, provide the requested information normally
3. If user explicitly requested specific information (positions, balances, strategies), always provide that information regardless of prevActions
4. Only avoid duplication when the EXACT SAME information was already provided in the EXACT SAME format
</instructions>
<keys>
${formatKeys(dataDescription)}

IMPORTANT: When generating the 'message' field, preserve all requested information while rephrasing for clarity and character voice.
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
FINAL CHECK: Ensure your message preserves all requested data and information from the initial text.
</output>`;
