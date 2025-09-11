import {
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
} from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../../constants/enum";
import { ETH_NULL_ADDR } from "../../constants/eth";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../../providers";
import {
  POSITION_PARAMS_PROVIDER_NAME,
  PositionParamsProviderData,
} from "../../providers/position-params";
import { selectProviderState } from "../../providers/util";
import { LevvaService } from "../../services/levva/class";
import { IntentContext, IntentHandler } from "../../services/intent-manager";
import { ActionResult } from "../../util/action-results";
import { CalldataWithDescription } from "../../types/tx";
import { rephrase } from "../../util/generate";

/**
 * Deposit Intent Handler
 *
 * Handles deposit/investment operations with intent context tracking.
 * Supports both pool strategies (with leverage) and vault strategies.
 * Moved from suggest-strategy action for better separation of concerns.
 */
export const handleDepositIntent: IntentHandler = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  prevActions?: any
): Promise<ActionResult> => {
  try {
    runtime.logger.info("Handling DEPOSIT intent", {
      intentId: intentContext.id,
      intentType: intentContext.type,
    });

    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      throw new Error("Failed to get levva service, disable action");
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

    const params = selectProviderState<PositionParamsProviderData>(
      POSITION_PARAMS_PROVIDER_NAME,
      state
    );

    if (!params) {
      throw new Error(
        `Failed to get provider(${POSITION_PARAMS_PROVIDER_NAME}) results`
      );
    }

    // Get deposit parameters from intent context (extracted by position-params provider)
    const {
      strategyId,
      strategyName,
      tokenSymbol,
      tokenAddress,
      amount,
      leverage,
    } = intentContext.returnData || {};

    // Check if we have all required parameters
    if (!strategyId && !strategyName) {
      return await handleMissingDepositParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        params,
        prevActions,
        "strategy"
      );
    }

    if (!tokenSymbol && !tokenAddress) {
      return await handleMissingDepositParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        params,
        prevActions,
        "token"
      );
    }

    if (!amount) {
      return await handleMissingDepositParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        params,
        prevActions,
        "amount"
      );
    }

    // All parameters available - execute the deposit
    return await executeDepositTransaction(
      runtime,
      message,
      state,
      callback,
      intentContext,
      { strategyId, strategyName, tokenSymbol, tokenAddress, amount, leverage },
      lvva,
      service,
      prevActions
    );
  } catch (error) {
    runtime.logger.error("Error in deposit intent handler:", error);

    const errorContent = await rephrase({
      runtime,
      content: {
        text: `I encountered an error while processing your deposit request: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        source: message.content.source,
      },
      prevActions,
    });

    await callback(errorContent);

    return {
      text: "Deposit intent handler error",
      success: false,
      values: {
        success: false,
        responded: true,
        lastReply: errorContent.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        intentType: "DEPOSIT",
        intentId: intentContext.id,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
};

/**
 * Handle missing deposit parameters by asking user for more information
 */
async function handleMissingDepositParameters(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  params: PositionParamsProviderData,
  prevActions?: any,
  missingParam?: string
): Promise<ActionResult> {
  // Get context from intent data and conversation
  const { returnData } = intentContext;
  const {
    strategyId,
    strategyName,
    strategyRisk,
    tokenSymbol,
    tokenAddress,
    amount,
  } = returnData || {};

  // Get service and provider state for strategy lookup
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.toString());
  const lvva = selectProviderState<LevvaProviderState>(
    state,
    LEVVA_PROVIDER_NAME
  );

  // Build context-aware response based on what we already know
  let contextualResponse = "";

  if (missingParam === "strategy") {
    // We know they want to deposit but not which strategy
    if (tokenSymbol || tokenAddress) {
      contextualResponse = `I see you want to deposit ${tokenSymbol || "tokens"}. Which strategy would you like to use? You can choose from ultra-safe, safe, or brave strategies.`;
    } else {
      contextualResponse = `I can help you choose an investment strategy. Would you prefer an ultra-safe, safe, or brave strategy?`;
    }
  } else if (missingParam === "token") {
    // This should mainly apply to pool strategies, as vault strategies auto-determine token
    if (strategyName || strategyRisk) {
      const strategy = strategyName || `${strategyRisk} strategy`;
      contextualResponse = `Great choice on the ${strategy}! Which token would you like to deposit? You can use USDC, ETH, or other tokens from your portfolio.`;
    } else {
      contextualResponse = `Which token would you like to deposit? I can see your available tokens and help you choose.`;
    }
  } else if (missingParam === "amount") {
    // We know strategy and token but not amount
    const strategy =
      strategyName || (strategyRisk ? `${strategyRisk} strategy` : "strategy");

    // For vault strategies, use the strategy's underlyingToken symbol
    // For pool strategies or when strategy is unknown, use extracted token data
    let token = "tokens";

    // Try to get the actual strategy to determine the correct token
    if ((strategyName || strategyRisk || strategyId) && service && lvva) {
      try {
        const chainId = lvva.chainId;
        const availableStrategies = await service.getStrategies(chainId);

        const foundStrategy = availableStrategies.find(
          (s) =>
            s.id === strategyId ||
            (s.name &&
              strategyName &&
              s.name.toLowerCase() === strategyName.toLowerCase()) ||
            (strategyRisk &&
              s.risk.toLowerCase() === strategyRisk.toLowerCase())
        );

        if (
          foundStrategy?.type === "vault" &&
          foundStrategy.vault?.underlyingToken
        ) {
          token = foundStrategy.vault.underlyingToken.symbol;
        } else {
          // For pool strategies or when vault info is missing, use extracted token
          token =
            tokenSymbol ||
            (tokenAddress !== ETH_NULL_ADDR ? tokenAddress : "ETH") ||
            "tokens";
        }
      } catch {
        // Fallback to extracted token data
        token =
          tokenSymbol ||
          (tokenAddress !== ETH_NULL_ADDR ? tokenAddress : "ETH") ||
          "tokens";
      }
    } else {
      // No strategy info, use extracted token
      token =
        tokenSymbol ||
        (tokenAddress !== ETH_NULL_ADDR ? tokenAddress : "ETH") ||
        "tokens";
    }

    contextualResponse = `Perfect! How much ${token} would you like to deposit into the ${strategy}? You can specify an amount like "100 USDC" or "0.1 ETH".`;
  } else {
    contextualResponse = `I'd be happy to help you with your deposit. Could you tell me which strategy and token you'd like to use?`;
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
    text: "Generated contextual deposit parameter request",
    success: true,
    values: {
      success: true,
      responded: true,
      lastReply: errorContent.text,
      lastReplyTime: Date.now(),
    },
    data: {
      actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
      intentType: "DEPOSIT",
      intentId: intentContext.id,
      needsMoreInfo: true,
      missingParameter: missingParam,
      knownParameters: {
        strategyId,
        strategyName,
        strategyRisk,
        tokenSymbol,
        tokenAddress,
        amount,
      },
    },
  };
}

/**
 * Execute the deposit transaction with all parameters available
 */
async function executeDepositTransaction(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback: HandlerCallback,
  intentContext: IntentContext,
  depositParams: {
    strategyId?: number;
    strategyName?: string;
    tokenSymbol?: string;
    tokenAddress?: string;
    amount?: string;
    leverage?: number;
  },
  lvva: LevvaProviderState,
  service: LevvaService,
  prevActions?: any
): Promise<ActionResult> {
  const {
    strategyId,
    strategyName,
    tokenSymbol,
    tokenAddress,
    amount,
    leverage,
  } = depositParams;

  // Get full strategy data from service (needed for contractAddress, etc.)
  const chainId = lvva.chainId;
  const availableStrategies = await service.getStrategies(chainId);

  // Find the strategy by ID or name
  const strategy = availableStrategies.find(
    (s) =>
      s.id === strategyId ||
      (s.name &&
        strategyName &&
        s.name.toLowerCase() === strategyName.toLowerCase())
  );

  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId || strategyName}`);
  }

  // For vault strategies, token is determined by the vault's underlyingToken
  // For pool strategies, we need user to specify the token
  let tokenIn: string;
  let actualToken: string;

  if (strategy.type === "vault") {
    // Vault strategies only accept their specific underlyingToken
    if (!strategy.vault?.underlyingToken) {
      throw new Error(
        `Vault strategy ${strategy.id} missing underlyingToken information`
      );
    }

    actualToken = strategy.vault.underlyingToken.symbol;
    tokenIn = strategy.vault.underlyingToken.address;

    // If user specified a token, validate it matches the vault's underlyingToken
    if (tokenSymbol || tokenAddress) {
      const userToken = tokenAddress || tokenSymbol;
      const isValidToken =
        userToken?.toLowerCase() ===
          strategy.vault.underlyingToken.symbol.toLowerCase() ||
        userToken?.toLowerCase() ===
          strategy.vault.underlyingToken.address.toLowerCase() ||
        // Handle ETH/WETH aliases
        (userToken?.toLowerCase() === "eth" &&
          strategy.vault.underlyingToken.symbol.toLowerCase() === "weth") ||
        (userToken?.toLowerCase() === "weth" &&
          strategy.vault.underlyingToken.symbol.toLowerCase() === "weth");

      if (!isValidToken) {
        throw new Error(
          `Invalid token for ${strategy.name}. This vault only accepts ${strategy.vault.underlyingToken.symbol} deposits.`
        );
      }
    }
  } else if (strategy.type === "pool") {
    // Pool strategies require user to specify token
    tokenIn = tokenAddress || tokenSymbol || "";
    if (!tokenIn) {
      throw new Error("Token information is required for pool strategies");
    }
    actualToken = tokenSymbol || tokenAddress || tokenIn;
  } else {
    throw new Error(`Unsupported strategy type: ${strategy.type}`);
  }

  runtime.logger.info("Executing deposit transaction", {
    intentId: intentContext.id,
    strategy: strategy.name,
    amount,
    tokenIn,
    leverage,
  });

  const address = lvva.user!.address;
  let calldata: CalldataWithDescription[];
  let thought: string;
  let text: string;

  try {
    if (strategy.type === "pool") {
      // Handle pool strategy with leverage
      calldata = await service.handlePoolStrategy(
        strategy,
        address,
        tokenIn,
        amount!,
        leverage
      );

      thought = `Prepared transaction to deposit ${amount} ${tokenIn} to pool ${strategy.contractAddress} with x${leverage || 1} leverage, need to display confirmation`;

      const detailedSteps = calldata
        .map((c, i) => `${i + 1}. ${c.description}`)
        .join("\n");

      text = `### Deposit to Pool Strategy\n\n**Strategy:** ${strategy.name}\n\n**Token:** ${actualToken}\n\n**Amount:** ${amount}\n\n**Leverage:** x${leverage || 1}\n\n### Transaction Steps:\n${detailedSteps}`;
    } else if (strategy.type === "vault") {
      // Handle vault strategy - no token parameter needed, it uses vault's underlyingToken
      const shouldWrapEth =
        actualToken.toLowerCase() === "eth" &&
        strategy.vault?.underlyingToken.symbol.toLowerCase() === "weth";

      calldata = await service.handleVaultStrategy(
        strategy,
        address,
        amount!,
        shouldWrapEth
      );

      thought = `Prepared transaction to deposit ${amount} ${actualToken} to vault ${strategy.contractAddress}, need to display confirmation`;

      const detailedSteps = calldata
        .map((c, i) => `${i + 1}. ${c.description}`)
        .join("\n");

      text = `### Deposit to Vault Strategy\n\n**Strategy:** ${strategy.name}\n\n**Token:** ${actualToken}\n\n**Amount:** ${amount}\n\n### Transaction Steps:\n${detailedSteps}`;
    } else {
      throw new Error(`Unsupported strategy type: ${strategy.type}`);
    }

    // Create calldata hash for transaction execution
    const calldataHash = await service.createCalldata(calldata);

    const content = await rephrase({
      runtime,
      content: {
        attachments: [
          {
            id: "calls.json",
            url: `/api/calldata?hash=${calldataHash}`,
          },
        ],
        text,
        thought,
        source: message.content.source,
        actions: ["MANAGE_POSITIONS"],
      },
      prevActions,
    });

    await callback(content);

    return {
      text: "Deposit transaction prepared successfully",
      success: true,
      values: {
        success: true,
        responded: true,
        lastReply: content.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        intentType: "DEPOSIT",
        intentId: intentContext.id,
        strategy: strategy.name,
        amount,
        token: tokenSymbol || tokenAddress,
        leverage: leverage || 1,
      },
    };
  } catch (error) {
    runtime.logger.error("Error preparing deposit transaction:", error);

    const errorContent = await rephrase({
      runtime,
      content: {
        text: `I encountered an error while preparing your deposit transaction: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        source: message.content.source,
      },
      prevActions,
    });

    await callback(errorContent);

    return {
      text: "Deposit transaction preparation failed",
      success: false,
      values: {
        success: false,
        responded: true,
        lastReply: errorContent.text,
        lastReplyTime: Date.now(),
      },
      data: {
        actionName: LEVVA_ACTIONS.MANAGE_POSITIONS,
        intentType: "DEPOSIT",
        intentId: intentContext.id,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Success callback for deposit transactions
 * Called by the intent-acknowledge evaluator when deposit transaction succeeds
 */
export const onDepositSuccess = async (
  runtime: IAgentRuntime,
  intentContext: IntentContext
): Promise<void> => {
  try {
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (
      service &&
      intentContext.metadata?.userAddress &&
      intentContext.metadata?.chainId
    ) {
      const userAddress = intentContext.metadata.userAddress as `0x${string}`;
      const chainId = intentContext.metadata.chainId as number;

      // Invalidate relevant caches after successful deposit
      await Promise.all([
        service.invalidateUserPositionsCache(userAddress, chainId),
        service.invalidateUserBalanceCache(userAddress, chainId),
      ]);

      runtime.logger.info("Invalidated user caches after deposit", {
        intentId: intentContext.id,
        userAddress,
        chainId,
      });
    }
  } catch (error) {
    runtime.logger.error("Error in deposit success callback:", error);
  }
};
