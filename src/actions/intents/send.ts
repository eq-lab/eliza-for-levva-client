import { Memory, IAgentRuntime, State, HandlerCallback } from "@elizaos/core";
import { UUID } from "crypto";
import { isAddress, parseUnits, encodeFunctionData } from "viem";
import { IntentContext, IntentHandler } from "../../services/intent-manager";
import { LevvaService } from "../../services/levva/class";
import { LEVVA_SERVICE } from "../../constants/enum";
import { ActionResult } from "../../util/action-results";
import { ETH_NULL_ADDR } from "../../constants/eth";
import { rephrase } from "../../util/generate";
import { LevvaProviderState, LEVVA_PROVIDER_NAME } from "../../providers";
import { selectProviderState } from "../../providers/util";

// ERC20 Transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface ExtractedDataForSend {
  tokenSymbol?: string;
  tokenAddress?: `0x${string}`;
  recipientAddress?: `0x${string}`;
  amount?: string;
  confidence: number;
  thought: string;
}

export const handleSendIntent: IntentHandler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> => {
  try {
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );
    if (!service) {
      throw new Error("LevvaService not available");
    }

    if (!callback) {
      throw new Error("Callback not found, disable action");
    }

    if (!state) {
      throw new Error("State not found, disable action");
    }

    // Get provider data
    const lvva = selectProviderState<LevvaProviderState>(
      LEVVA_PROVIDER_NAME,
      state
    );

    if (!lvva?.user) {
      throw new Error("User address is required");
    }

    const { returnData } = intentContext;
    const { tokenSymbol, tokenAddress, recipientAddress, amount } =
      returnData || {};

    // Validate required parameters
    if (!recipientAddress || !isAddress(recipientAddress)) {
      return handleMissingSendParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        prevActions,
        "recipientAddress",
        "Please provide a valid recipient address"
      );
    }

    if (!amount || isNaN(parseFloat(amount))) {
      return handleMissingSendParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        prevActions,
        "amount",
        "Please specify the amount to send"
      );
    }

    if (!tokenSymbol && !tokenAddress) {
      return handleMissingSendParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        prevActions,
        "token",
        "Please specify which token to send"
      );
    }

    const chainId = lvva.chainId;
    const userAddress = lvva.user.address;

    // Get user's wallet assets to find the token
    const assets = await service.getWalletAssets({
      chainId,
      address: userAddress,
    });

    // Get token data using service method
    const tokenData = await service.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: tokenAddress || tokenSymbol,
    });

    if (!tokenData) {
      throw new Error(`Token ${tokenSymbol || tokenAddress} not found`);
    }

    // Find the token in user's assets
    const selectedToken = assets.find(
      (asset) =>
        asset.address.toLowerCase() ===
          (tokenData.address || ETH_NULL_ADDR).toLowerCase() ||
        asset.token.toLowerCase() ===
          (tokenData.address || ETH_NULL_ADDR).toLowerCase()
    );

    if (!selectedToken) {
      throw new Error(
        `Token ${tokenSymbol || tokenAddress} not found in your wallet`
      );
    }

    // Check if user has sufficient balance
    const sendAmount = parseFloat(amount);
    const tokenBalance = Number(selectedToken.amount) / 1e18; // Convert from wei

    if (sendAmount > tokenBalance) {
      throw new Error(
        `Insufficient balance. You have ${tokenBalance} tokens, but trying to send ${sendAmount}`
      );
    }

    // Execute the transfer
    const transactionResult = await executeSendTransaction({
      runtime,
      service,
      chainId,
      userAddress,
      tokenAddress: (selectedToken.address === ETH_NULL_ADDR
        ? ETH_NULL_ADDR
        : selectedToken.address) as `0x${string}`,
      tokenSymbol:
        selectedToken.token === ETH_NULL_ADDR
          ? "ETH"
          : `Token ${selectedToken.token}`,
      recipientAddress,
      amount: sendAmount,
      decimals: 18, // Default to 18 decimals
    });

    return transactionResult;
  } catch (error) {
    runtime.logger.error("Send intent handler error:", error);
    const errorMessage = (error as Error).message || "Unknown error occurred";

    const errorContent = {
      text: `Failed to send tokens: ${errorMessage}`,
      thought: `Send transaction failed: ${errorMessage}`,
      actions: ["ANALYZE_WALLET"],
      source: message.content.source,
    };

    const responseContent = await rephrase({
      runtime,
      content: errorContent,
      state: undefined,
      prevActions: undefined,
    });

    return {
      text: "Send intent handler error",
      success: false,
      values: {
        success: false,
        responded: true,
        lastReply: responseContent.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: "ANALYZE_WALLET",
        error: errorMessage,
        intentId: intentContext.id,
      },
    };
  }
};

const handleMissingSendParameters = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions: any,
  missingParam: string,
  errorMessage: string
): Promise<ActionResult> => {
  const { returnData } = intentContext;
  const { tokenSymbol, tokenAddress, recipientAddress, amount } =
    returnData || {};

  let contextualResponse = "";

  if (missingParam === "recipientAddress") {
    contextualResponse = `I need to know where to send the tokens. Please provide a valid recipient address (0x...).`;
  } else if (missingParam === "amount") {
    const token = tokenSymbol || tokenAddress || "tokens";
    contextualResponse = `How much ${token} would you like to send? Please specify an amount like "100 USDC" or "0.1 ETH".`;
  } else if (missingParam === "token") {
    contextualResponse = `Which token would you like to send? You can specify a token symbol like "USDC" or "ETH".`;
  } else {
    contextualResponse = errorMessage;
  }

  const errorContent = await rephrase({
    runtime,
    content: {
      text: contextualResponse,
      source: message.content.source,
    },
    prevActions,
  });

  await callback(errorContent);

  return {
    text: "Generated contextual send parameter request",
    success: true,
    values: {
      success: true,
      responded: true,
      lastReply: errorContent.text,
      lastReplyTime: Date.now(),
    },
    data: {
      actionName: "ANALYZE_WALLET",
      intentType: "SEND",
      intentId: intentContext.id,
      needsMoreInfo: true,
      missingParameter: missingParam,
      knownParameters: { tokenSymbol, tokenAddress, recipientAddress, amount },
    },
  };
};

const executeSendTransaction = async (params: {
  runtime: IAgentRuntime;
  service: LevvaService;
  chainId: number;
  userAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  recipientAddress: `0x${string}`;
  amount: number;
  decimals: number;
}): Promise<ActionResult> => {
  const {
    runtime,
    service,
    tokenAddress,
    tokenSymbol,
    recipientAddress,
    amount,
    decimals,
  } = params;

  try {
    let calldataWithDescription;

    if (tokenAddress === ETH_NULL_ADDR) {
      // Native ETH transfer
      const amountWei = parseUnits(amount.toString(), 18);

      calldataWithDescription = [
        {
          to: recipientAddress,
          data: "0x" as `0x${string}`,
          value: amountWei.toString(),
          title: `Send ${amount} ETH`,
          description: `Transfer ${amount} ETH to ${recipientAddress}`,
        },
      ];
    } else {
      // ERC20 token transfer
      const amountWei = parseUnits(amount.toString(), decimals);

      const transferData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [recipientAddress, amountWei],
      });

      calldataWithDescription = [
        {
          to: tokenAddress,
          data: transferData,
          value: "0",
          title: `Send ${amount} ${tokenSymbol}`,
          description: `Transfer ${amount} ${tokenSymbol} to ${recipientAddress}`,
        },
      ];
    }

    const calldataHash = await service.createCalldata(calldataWithDescription);

    const thought = `Successfully prepared ${tokenSymbol} transfer transaction. User can now execute the transfer of ${amount} ${tokenSymbol} to ${recipientAddress}.`;
    const text = `## Transfer Prepared ✅

**Token**: ${tokenSymbol}
**Amount**: ${amount}
**Recipient**: ${recipientAddress}
**Transaction Hash**: ${calldataHash}

Your transfer is ready to execute. The transaction will send ${amount} ${tokenSymbol} to the specified address.`;

    const content = {
      text,
      thought,
      actions: ["ANALYZE_WALLET"],
      source: "send_intent",
    };

    const responseContent = await rephrase({
      runtime: runtime,
      content,
      state: undefined,
      prevActions: undefined,
    });

    return {
      text: responseContent.text || "Send transaction completed successfully",
      success: true,
      values: {
        success: true,
        responded: true,
        lastReply: responseContent.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: "SEND_TOKENS",
        calldataHash,
        tokenSymbol,
        amount,
        recipientAddress,
        transactionPrepared: true,
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to prepare transfer transaction: ${(error as Error).message}`
    );
  }
};

export const onSendSuccess = async (
  runtime: IAgentRuntime,
  intentContext: IntentContext
): Promise<void> => {
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);
  if (!service) return;

  const user = await service.getUserById(intentContext.userId as UUID);
  if (!user) return;

  const userAddress = user.address as `0x${string}`;
  const chainId = 1; // Default to Ethereum mainnet
  try {
    // Invalidate user balance cache after successful send
    await service.invalidateUserBalanceCache(userAddress, chainId);
    runtime.logger.info("Invalidated user balances cache after token send");
  } catch (error) {
    runtime.logger.error("Failed to invalidate cache after send:", error);
  }
};
