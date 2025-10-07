export interface SwapContinuationParams {
  conversation: string;
  intentContext: any;
  swapParams?: any;
  walletAssetsFormatted: string;
}

export const swapContinuationPrompt = ({
  conversation,
  intentContext,
  swapParams,
  walletAssetsFormatted,
}: SwapContinuationParams): string => {
  return `<task>Generate suggestions for continuing an active swap intent</task>
<intentContext>
Intent ID: ${intentContext.id}
Intent Type: ${intentContext.type}
Intent Status: ${intentContext.status}
Intent Data: ${JSON.stringify(intentContext.returnData || {})}
Created: ${intentContext.createdAt}
Memories: ${intentContext.memories?.length || 0} messages
</intentContext>
<swapParams>
${swapParams ? JSON.stringify(swapParams) : "No swap parameters available"}
</swapParams>
<portfolio>
${walletAssetsFormatted}
</portfolio>
<conversation>
${conversation}
</conversation>
<instructions>
Based on the active intent context and current parameters, generate 3-4 suggestions for continuing the swap process:

1. **Missing Token Information**: If tokens aren't specified, suggest specific token pairs from portfolio
2. **Missing Amount**: If amount isn't specified, suggest percentage-based amounts (10%, 25%, 50%, 95%)
3. **Complete Parameters**: If all parameters are available, suggest proceeding with the swap
4. **Issues/Alternatives**: If there are problems (insufficient balance, etc.), suggest alternatives

**Smart Suggestions:**
- Prioritize tokens with sufficient balances
- Consider gas costs (suggest 95% not 100% for native tokens)
- Use intent memory context to understand user preferences
- Suggest realistic amounts based on portfolio

Each suggestion should help move the intent forward toward completion.
</instructions>
<output>
{
  "thought": "Analysis of current intent state and next steps needed",
  "suggestions": [
    {
      "label": "Short descriptive label",
      "text": "Natural user message to continue the intent"
    }
  ]
}
</output>`;
};
