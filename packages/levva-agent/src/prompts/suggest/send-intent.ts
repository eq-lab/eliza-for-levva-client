import type { IntentContext } from "../../services/intent-manager";
import {
  generateIntentContextSection,
  generateOutputFormat,
  generateCommonInstructions,
} from "../helpers";
import { calculateAmountsFromBalance } from "../helpers/amount-suggestions";

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
    decimals?: number;
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

    // Get wallet asset for balance-aware amount suggestions
    const walletAsset = walletAssets.find((a) => {
      if (tokenAddress) {
        return a.token.toLowerCase() === tokenAddress.toLowerCase();
      }
      return a.symbol.toLowerCase() === tokenSymbol?.toLowerCase();
    });

    const amounts = calculateAmountsFromBalance(
      walletAsset?.amount ?? 0n,
      walletAsset?.decimals ?? 18,
      walletAsset?.token
    );

    // Get alternative tokens for suggestions
    const alternativeTokens = walletAssets
      .filter((a) => a.amount > 0n && a.symbol !== tokenDisplay)
      .slice(0, 2)
      .map((a) => a.symbol);

    const intentContext = generateIntentContextSection({
      intentType: "SEND",
      status: "All parameters set (confirmation handled in UI)",
      userAddress,
      chainId,
      parameters: {
        Token: tokenDisplay,
        Amount: amount,
        Recipient: shortRecipient,
        ...(amounts.hasBalance
          ? { "Available Balance": `${amounts.fullAmount} ${tokenDisplay}` }
          : {}),
      },
    });

    const amountContext = amounts.hasBalance
      ? `\nUser has ${amounts.fullAmount} ${tokenDisplay} available. Suggest specific amounts: ${amounts.amount50} ${tokenDisplay}, ${amounts.amount75} ${tokenDisplay}.`
      : "";

    const tokenContext =
      alternativeTokens.length > 0
        ? `\nAlternative tokens: ${alternativeTokens.join(", ")}`
        : "";

    // Build label format examples
    const labelExamples = [];
    if (amounts.hasBalance) {
      labelExamples.push(
        `- "Send ${amounts.amount50} ${tokenDisplay}" - for 50% amount`,
        `- "Send ${amounts.amount75} ${tokenDisplay}" - for 75% amount`
      );
    } else {
      labelExamples.push(`- "Different amount" - for amount change`);
    }
    if (alternativeTokens.length > 0) {
      labelExamples.push(
        `- "Send ${alternativeTokens[0]}" - for specific token change`
      );
    } else {
      labelExamples.push(`- "Different token" - for token change`);
    }
    labelExamples.push(
      `- "Different recipient" - for address change`,
      `- "Cancel transfer" - for cancellation`
    );

    // Build text format examples
    const textExamples = [];
    if (amounts.hasBalance) {
      textExamples.push(
        `- "Actually, send ${amounts.amount50} ${tokenDisplay} instead"`,
        `- "Let me send ${amounts.amount75} ${tokenDisplay}"`
      );
    } else {
      textExamples.push(`- "Actually, send a different amount"`);
    }
    if (alternativeTokens.length > 0) {
      textExamples.push(`- "Send ${alternativeTokens[0]} instead"`);
    } else {
      textExamples.push(`- "Change to a different token"`);
    }
    textExamples.push(
      `- "Send to a different address"`,
      `- "Cancel this transfer"`
    );

    const instructions = generateCommonInstructions({
      suggestionType: "missing-info",
      specificInstructions: `Generate 3-5 natural, conversational suggestions for editing or cancelling:

IMPORTANT: DO NOT suggest confirmation - that is handled by the UI.
Only provide suggestions for EDITING parameters or CANCELLING.
${amountContext}${tokenContext}

SUGGESTION PRIORITIES:
1. Edit amount with SPECIFIC amounts from balance
2. Change to SPECIFIC alternative token
3. Change recipient address (warn about irreversibility)
4. Cancel transfer

LABEL FORMAT (must be SPECIFIC):
${labelExamples.join("\n")}

TEXT FORMAT (use ACTUAL specific values):
${textExamples.join("\n")}

Each suggestion should:
- Use SPECIFIC amounts or token names in BOTH label and text
- Be natural and conversational
- Focus on parameter modification or cancellation
- NOT include confirmation suggestions
- Emphasize that transfers are irreversible (if user wants to change recipient)`,
    });

    return `<task>Generate edit/cancel suggestions for send - all parameters set</task>
${intentContext}
<conversation>
${conversation}
</conversation>
${instructions}
${generateOutputFormat()}`;
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

    // Calculate actual amounts to help LLM generate suggestions
    const amounts = calculateAmountsFromBalance(
      walletAsset?.amount ?? 0n,
      walletAsset?.decimals ?? 18,
      walletAsset?.token
    );

    const amountContext = amounts.hasBalance
      ? `\nUser has ${amounts.fullAmount} ${tokenDisplay} available in wallet.
Calculated amounts for suggestions:
- 25%: ${amounts.amount25} ${tokenDisplay}
- 50%: ${amounts.amount50} ${tokenDisplay}
- 75%: ${amounts.amount75} ${tokenDisplay}
- 100%: ${amounts.fullAmount} ${tokenDisplay}`
      : `\nUser balance unknown for ${tokenDisplay}.`;

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

LABEL FORMAT (can include percentages):
- "Send 25%", "Send 50%", "Send 75%", "Send all"
- Or specific amounts: "Send ${amounts.amount50} ${tokenDisplay}"

TEXT FORMAT (must use actual calculated amounts):
- Use the calculated amounts provided above
- Examples: 
  • "Send ${amounts.amount25} ${tokenDisplay}"
  • "Send ${amounts.amount50} ${tokenDisplay}"
  • "Send ${amounts.amount75} ${tokenDisplay}"
  • "Send ${amounts.fullAmount} ${tokenDisplay}"
- Include "Let me specify exact amount" option for precision
- NEVER use percentages in text field

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
