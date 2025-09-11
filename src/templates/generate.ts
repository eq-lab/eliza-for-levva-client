import { EnumWithDescription, enumWithDescription } from "./util";

/** @deprecated needs refactoring */
export const suggestTypeTemplate = (
  types: EnumWithDescription[]
) => `<task>Select the most suitable suggest type for user's next message.</task>
<conversation>
{{conversation}}
</conversation>

These are the available suggestion types:
<suggestionTypes>
${enumWithDescription(types)}
</suggestionTypes>
<user>
{{userData}}
</user>
<instructions>
Analyze the conversation to understand the current context and what the user needs to provide next.

CONTEXT ANALYSIS RULES:
- Look at the agent's last message to understand what information is being requested
- If agent asks for "amount", "how much", or "specify amount" → prioritize amount-based suggestions
- If agent asks for "strategy", "which strategy" → prioritize strategy selection suggestions  
- If agent asks for "token", "which token" → prioritize token selection suggestions
- If agent asks for "address", "recipient" → prioritize address-based suggestions

IMPORTANT DATA SELECTION RULES:
- If user asked to cancel transaction, no KNOWN data can be selected before the cancel.
- If user confirmed transaction, no KNOWN data can be selected before the confirmation.
- Ignore data if it was provided as an example by an agent.
- Focus on what the user still needs to provide based on the agent's current request

CONVERSATION FLOW PRIORITY:
1. If agent is asking for specific information (amount, token, strategy), generate suggestions for that specific need
2. If conversation shows active transaction flow, continue that flow with appropriate suggestions
3. If no specific request, use general suggestions

First, identify what the agent is currently asking for, then decide what data is KNOWN and which field is UNKNOWN. Select the suggestion type that best helps the user respond to the agent's current request.
</instructions>
<keys>
- "thought" should be a short description of what the agent is thinking about and planning.
- "type" should have one of the following values: ${types.map((item) => `"${item.name}"`).join(", ")}
- "known" should be a JSON object
- "unknown" should be an array of strings
</keys>
<output>
Respond using JSON format like this:
{
  "thought": "<string>",
  "type": "<${types.map((item) => `"${item.name}"`).join(" | ")}>",
  "known": "<object>",
  "unknown": "<array>"
}

Your response should include the valid JSON block and nothing else.
</output>`;
