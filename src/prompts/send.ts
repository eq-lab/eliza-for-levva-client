import { DataDescription, formatKeys, formatOutput } from "./util";

export interface ExtractedDataForSend {
  tokenSymbol?: string;
  tokenAddress?: `0x${string}`;
  recipientAddress?: `0x${string}`;
  amount?: string;
  confidence: number;
  thought: string;
}

const dataDescription: DataDescription<ExtractedDataForSend> = {
  tokenSymbol: {
    type: "string",
    description:
      "The symbol of the token to send (e.g., 'USDC', 'ETH', 'WETH')",
  },
  tokenAddress: {
    type: "string",
    description: "The contract address of the token to send (if provided)",
  },
  recipientAddress: {
    type: "string",
    description:
      "The wallet address to send tokens to (must be a valid Ethereum address)",
  },
  amount: {
    type: "string",
    description: "The amount of tokens to send (numeric value)",
  },
  confidence: {
    type: "number",
    description: "Confidence score from 0 to 1 for the extracted data",
  },
  thought: {
    type: "string",
    description: "Brief explanation of the extraction decision",
  },
};

export const extractSendDataFromMessagePrompt = (ctx: {
  inheritedData?: Record<string, any>;
  returnData?: Record<string, any>;
  messages?: string; // Conversation history for the current intent
  userPortfolio: string;
  availableTokens: string;
}) => {
  const currentMessage = ctx.messages?.split("\n").pop() || "";
  const inheritedContext = ctx.inheritedData
    ? `<inherited_context>${JSON.stringify(ctx.inheritedData)}</inherited_context>`
    : "";
  const returnDataContext = ctx.returnData
    ? `<return_data>${JSON.stringify(ctx.returnData)}</return_data>`
    : "";

  return `<task>
Extract token transfer parameters from user message for ERC20/ETH send transaction processing.
Consider user's available tokens and conversation context.
</task>
<message>
${currentMessage}
</message>
<conversation_history>
${ctx.messages || ""}
</conversation_history>
<user_portfolio>
${ctx.userPortfolio}
</user_portfolio>
<available_tokens>
${ctx.availableTokens}
</available_tokens>
${inheritedContext}
${returnDataContext}
<instructions>
Analyze the user message and conversation history to extract token transfer parameters.

CRITICAL SEND LOGIC:
- **Token Identification**:
  - Match token symbols (e.g., "USDC", "ETH", "WETH") from 'user_portfolio' or 'available_tokens'
  - Handle common aliases (e.g., "Ethereum" → "ETH", "USD Coin" → "USDC")
  - If token address is provided, validate it's a valid hex address
  - Prioritize tokens the user actually owns from 'user_portfolio'

- **Recipient Address**:
  - Extract Ethereum addresses (0x followed by 40 hex characters)
  - Validate address format (must be valid Ethereum address)
  - Handle ENS names if mentioned (but note they need resolution)
  - Look for phrases like "send to", "transfer to", "to address"

- **Amount Parsing**:
  - Extract numeric amounts (e.g., "100", "0.5", "1.5")
  - Handle percentage-based amounts (e.g., "50% of my USDC", "all my ETH")
  - Recognize keywords like "all", "max", "everything" as 100%
  - Validate amount doesn't exceed user's balance

- **Contextual Inference**:
  - Use 'conversation_history', 'inherited_context', and 'return_data' to complete missing parameters
  - If parameters were mentioned in previous messages within this intent, use them
  - Be careful not to assume parameters that weren't explicitly mentioned

EXTRACTION RULES:
- Return 'undefined' for unclear or missing parameters
- Provide high confidence (0.8-1.0) only when all parameters are clearly specified
- If user mentions sending tokens but missing critical info, return lower confidence
- Always validate that the token exists in user's portfolio
- Ensure recipient address is properly formatted

SAFETY CHECKS:
- Never assume recipient addresses - they must be explicitly provided
- Don't guess token amounts - user must specify them
- Validate token symbol against user's actual holdings
- Flag suspicious patterns (sending all tokens, unusual addresses)
</instructions>
<keys>
${formatKeys(dataDescription)}
</keys>
<output>
${formatOutput(dataDescription)}

Your response should include the valid JSON block and nothing else.
</output>`;
};
