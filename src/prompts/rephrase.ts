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
      "The next message for the agent to send to the conversation, rephrased from initial text",
  },
};

export const rephraseContentPrompt = (ctx: {
  agentName: string;
  providers: string;
  initialThought: string;
  initialText: string;
  prevActions?: string;
}) => `<task>
Generate dialog for the character ${ctx.agentName}
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

CRITICAL DEDUPLICATION RULES:
1. If prevActions contains specific data (dollar amounts, balances, strategy names, totals), DO NOT repeat them
2. If prevActions already provided position details, focus on next steps or questions instead
3. Use phrases like "As you can see above" or "Building on that information" if you must reference previous data
4. Provide NEW value: suggest actions, ask questions, offer options, or give additional context
5. Keep responses concise and avoid redundant information

CRITICAL DATA CONSISTENCY:
- Check for logical contradictions in your response
- If you mention positions with "Pending withdrawals", do NOT say "no pending withdrawals" in summary
- If individual items show pending status, overall summary must acknowledge this
- Be consistent between detailed information and summary statements

Analyze the prevActions above. If they contain detailed information (positions, balances, amounts), your response MUST provide NEW value and NOT repeat any specific data already shared. Focus on actionable next steps, questions, or additional context.
</instructions>
<keys>
${formatKeys(dataDescription)}
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
</output>`;
