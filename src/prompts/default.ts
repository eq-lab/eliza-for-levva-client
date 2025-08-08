export const defaultSuggestionPrompt = (ctx: {
  conversation: string;
}) => `<task>
Generate answers to agent's question and topics to interact with agent.
</task>
<conversation>
${ctx.conversation}
</conversation>
<capabilities>
- Analyze portfolio
- Suggest strategy
- Swap tokens
- Crypto news
</capabilities>
<instructions>
"LABEL" GENERATION INSTRUCTIONS:
Look at the last message from agent.
If it includes a question suggest answers, eg. "Agent: Are you sure to continue?" - ["Yes", "No"], "Agent: I han give you some options: 1. You can go south 2. You can go north 3. You can go east If you are interested I can tell you more." - ["South", "North", "East"]
Additionally, generate 4 suggestions based on capabilities, eg. ["My Assets", "Select strategy", "Swap tokens", "Crypto news"] 
"TEXT" GENERATION INSTRUCTIONS:
Take generated "label" and generate detailed response to message
Examples:
- "label": "My Assets" -> "text": "Please, tell me about my portfolio"
- "label": "Select strategy" -> "text": "Please help me to select a strategy"
- "label": "Swap tokens" -> "text": "I want to swap tokens"
- "label": "Crypto news" -> "text": "What's the latest news in crypto?"
</instructions>
<keys>
- "suggestions" should be an array of objects with the following keys:
  - "label" - short description of the suggestion
  - "text" - full message
</keys>
<output>
Respond using JSON format like this:
{
  "suggestions": 
    {
      "label": string,
      "text": string,
    }[]

Your response should include the valid JSON block and nothing else.
</output>`;
