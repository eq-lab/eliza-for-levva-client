import type { IntentContext } from "../../services/intent-manager";

export interface SendIntentSuggestionParams {
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
  returnData: {
    tokenSymbol?: string;
    tokenAddress?: string;
    recipientAddress?: string;
    amount?: string;
    [key: string]: any;
  };
  walletAssets: Array<{
    token: string;
    symbol: string;
    amount: bigint;
    value: bigint;
  }>;
}

/**
 * Generate intent-aware suggestions for SEND intent with progressive disclosure
 *
 * Progressive flow:
 * 1. No recipient -> Suggest entering recipient address or ask for it
 * 2. Recipient set, no token -> Suggest tokens from wallet
 * 3. Recipient + token set, no amount -> Suggest amounts
 * 4. All parameters set -> Suggest edit/cancel (confirmation in UI)
 */
export function generateSendIntentSuggestionsPrompt(
  params: SendIntentSuggestionParams
): string {
  const { returnData, conversation, userAddress, chainId, walletAssets } =
    params;

  const { tokenSymbol, tokenAddress, recipientAddress, amount } = returnData;

  // Case 1: All parameters present - only show edit/cancel
  // Confirmation is handled in UI, suggestions are only for editing
  if (recipientAddress && (tokenSymbol || tokenAddress) && amount) {
    const tokenDisplay = tokenSymbol || tokenAddress?.slice(0, 8) || "tokens";
    const shortRecipient = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;

    return `<task>Generate edit/cancel suggestions for send - all parameters set</task>
<intentContext>
Intent Type: SEND
Token: ${tokenDisplay}
Amount: ${amount}
Recipient: ${shortRecipient}
Status: All parameters set (confirmation handled in UI)
User Address: ${userAddress}
Chain ID: ${chainId}
</intentContext>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 3-5 natural, conversational suggestions for editing or cancelling:

IMPORTANT: DO NOT suggest confirmation - that is handled by the UI.
Only provide suggestions for EDITING parameters or CANCELLING.

SUGGESTION PRIORITIES:
1. Edit amount
2. Change token
3. Change recipient address
4. Cancel transfer

SUGGESTION FORMATS:
- "Actually, send a different amount" - edit amount
- "Change to a different token" - change token
- "Send to a different address" - change recipient
- "Cancel this transfer" - cancel

Each suggestion should:
- Be natural and conversational
- Focus on parameter modification or cancellation
- NOT include confirmation suggestions
- Emphasize that transfers are irreversible (if user wants to change recipient)
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Edit or cancel action",
      "text": "Natural message that edits parameters or cancels"
    }
  ]
}
</output>`;
  }

  // Case 2: Recipient + token set, need amount
  if (recipientAddress && (tokenSymbol || tokenAddress) && !amount) {
    const tokenDisplay = tokenSymbol || tokenAddress?.slice(0, 8) || "tokens";
    const shortRecipient = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;

    // Find the token in wallet to suggest percentage-based amounts
    const walletAsset = walletAssets.find((a) => {
      if (tokenAddress) {
        return a.token.toLowerCase() === tokenAddress.toLowerCase();
      }
      return a.symbol.toLowerCase() === tokenSymbol?.toLowerCase();
    });

    let amountContext = "";
    if (walletAsset) {
      amountContext = `\nUser has ${walletAsset.symbol} available in wallet.`;
    }

    return `<task>Generate amount suggestions for send</task>
<intentContext>
Intent Type: SEND
Token: ${tokenDisplay}
Recipient: ${shortRecipient}
Status: Need amount${amountContext}
</intentContext>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4-5 natural, conversational suggestions for send amounts:

AMOUNT OPTIONS:
- Percentage-based: "Send 25%", "Send 50%", "Send 75%", "Send all"
- Or specific amounts if context suggests it
- Include "Let me specify exact amount" for precision

Each suggestion should:
- Be natural and conversational
- Reference the token being sent
- Provide clear amount options
- Lead to confirmation next
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Amount selection",
      "text": "Natural message with amount"
    }
  ]
}
</output>`;
  }

  // Case 3: Recipient set, need token
  if (recipientAddress && !tokenSymbol && !tokenAddress) {
    const shortRecipient = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;

    // Get top tokens from wallet by value
    const topTokens = walletAssets
      .filter((a) => a.amount > 0n)
      .slice(0, 5)
      .map((a) => a.symbol);

    let tokenContext = "";
    if (topTokens.length > 0) {
      tokenContext = `\nUser's wallet tokens: ${topTokens.join(", ")}`;
    }

    return `<task>Generate token selection suggestions for send</task>
<intentContext>
Intent Type: SEND
Recipient: ${shortRecipient}
Status: Need token${tokenContext}
</intentContext>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 4-5 natural, conversational suggestions for token selection:

TOKEN OPTIONS:
- Show user's top tokens by value (from wallet)
- Include common tokens (ETH, USDC, etc.)
- Allow custom token selection

Each suggestion should:
- Be natural and conversational
- Reference actual tokens user has
- Lead to amount selection next
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Token selection",
      "text": "Natural message selecting token"
    }
  ]
}
</output>`;
  }

  // Case 4: No recipient - need recipient address
  return `<task>Generate recipient address suggestions for send</task>
<intentContext>
Intent Type: SEND
Status: Need recipient address
User Address: ${userAddress}
</intentContext>
<conversation>
${conversation}
</conversation>
<instructions>
Generate 3-5 natural, conversational suggestions for entering recipient:

RECIPIENT OPTIONS:
- "Send to [address]" - if user mentioned an address
- "Let me enter the recipient address" - manual entry
- "Send to myself" - self-transfer (different chain/wallet)
- "Cancel" - abort send

Each suggestion should:
- Be natural and conversational
- Help user provide recipient address
- Emphasize importance of correct address (irreversible)
</instructions>
<output>
Respond using JSON format:
{
  "suggestions": [
    {
      "label": "Recipient selection",
      "text": "Natural message about recipient"
    }
  ]
}
</output>`;
}
