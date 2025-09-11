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

STRUCTURED DATA PRIORITY:
- ALWAYS preserve structured data (## headers, bullet points, tables, dollar amounts) regardless of prevActions
- Structured data contains critical user-requested information that should never be deduplicated
- Only rephrase structured content for clarity while maintaining exact format and all data points
- Treat structured data as sacred - it represents specific user requests for detailed information

CAREFUL DEDUPLICATION RULES (Apply ONLY to conversational content):
1. **Structured Content**: NEVER deduplicate structured data (## headers, bullet points, dollar amounts, addresses, strategy details)
   - Always provide requested structured information in full
   - User explicitly requested this data format - honor that request
   
2. **Conversational Content**: Only deduplicate when ALL conditions are met:
   - prevActions contain IDENTICAL conversational responses (same tone, same general message)
   - Current content is also conversational (no structured elements)
   - No specific data was requested (no dollar amounts, strategy names, addresses)
   - User did not explicitly ask for information update or refresh
   
3. **Mixed Content**: If initialText contains ANY structured elements:
   - Preserve ALL structured data completely
   - Only rephrase conversational portions for variety
   - Never remove or summarize structured sections
   
4. **Explicit Requests**: If user explicitly requested information (positions, balances, strategies, portfolio):
   - Always provide that information regardless of prevActions
   - Treat as fresh request even if similar data was provided before
   
5. **Safe Deduplication**: Only provide alternative responses when:
   - Content is purely conversational
   - No structured data present
   - No specific information requested
   - Previous response was identical in substance and tone
</instructions>
<keys>
${formatKeys(dataDescription)}

IMPORTANT: When generating the 'message' field, preserve all requested information while rephrasing for clarity and character voice.
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.

FINAL VALIDATION CHECKLIST:
✅ Structured data (## headers, bullet points, dollar amounts) preserved exactly as provided
✅ All numerical values, addresses, strategy names, and balances included
✅ Original format maintained (structured stays structured, conversational stays conversational)
✅ No conversational introductions added to structured content
✅ Deduplication only applied to purely conversational content when safe
✅ User-requested information provided regardless of previous responses
</output>`;
