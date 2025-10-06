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
import { ExtractedDataForDeposit } from "../../prompts/deposit";
import { LevvaService } from "../../services/levva/class";
import { StrategyEntry } from "../../services/levva/pool";
import { IntentContext, IntentHandler } from "../../services/intent-manager";
import { CalldataWithDescription } from "../../types/tx";
import { ActionResult } from "../../util/action-results";
import { rephrase } from "../../util/generate";
import { generateDepositIntentSuggestionsPrompt } from "../../prompts/suggest/deposit-intent";

export interface DepositData extends ExtractedDataForDeposit {
  strategy?: StrategyEntry;
  [key: string]: any;
}

export function formatDepositIntent(data: DepositData): string {
  const {
    strategy,
    strategyId,
    strategyName,
    strategyRisk,
    tokenSymbol,
    tokenAddress,
    amount,
    leverage,
  } = data || {};

  const hasStrategyInput = Boolean(
    strategy || strategyId || strategyName || strategyRisk
  );

  const isVault = strategy?.type === "vault";
  const isPool = strategy?.type === "pool";

  // Strategy formatting
  let strategyLine = "[Not specified]";
  if (strategy) {
    const parts: string[] = [];
    parts.push(strategy.name || "Unknown");
    parts.push(`ID: ${strategy.id}`);
    if (strategy.type) parts.push(`Type: ${strategy.type}`);
    if (strategy.risk) parts.push(`Risk: ${strategy.risk}`);
    strategyLine = `${parts.join(", ")}`;

    if (isVault && strategy.vault?.underlyingToken?.symbol) {
      strategyLine += ` - Underlying: ${strategy.vault.underlyingToken.symbol}`;
    }
  } else if (hasStrategyInput) {
    const parts: string[] = [];
    if (strategyName) parts.push(`Name: ${strategyName}`);
    if (Number.isFinite(strategyId)) parts.push(`ID: ${strategyId}`);
    if (strategyRisk) parts.push(`Risk: ${strategyRisk}`);
    strategyLine = parts.length ? parts.join(", ") : strategyLine;
  }

  // Token formatting
  let inferredVaultTokenNote = "";
  let tokenLine = "[Not specified]";
  if (isVault) {
    const vaultSymbol = strategy?.vault?.underlyingToken?.symbol;
    const vaultAddress = strategy?.vault?.underlyingToken?.address;
    const providedSymbolOrAddress = tokenSymbol || tokenAddress;
    const displaySymbol = providedSymbolOrAddress || vaultSymbol;
    const displayAddress = providedSymbolOrAddress
      ? tokenAddress
      : vaultAddress;

    if (displaySymbol || displayAddress) {
      const symbolText = displaySymbol ?? "";
      const addressText = displayAddress
        ? displayAddress === ETH_NULL_ADDR
          ? "ETH"
          : displayAddress
        : "";
      tokenLine = [symbolText, addressText && `(${addressText})`]
        .filter(Boolean)
        .join(" ");
    }

    if (!tokenSymbol && !tokenAddress && vaultSymbol) {
      inferredVaultTokenNote = `\n- Note: Token is derived from vault underlying token (${vaultSymbol})`;
    }
  } else if (isPool) {
    if (tokenSymbol || tokenAddress) {
      const addressText = tokenAddress
        ? tokenAddress === ETH_NULL_ADDR
          ? "ETH"
          : tokenAddress
        : "";
      tokenLine = [tokenSymbol ?? "", addressText && `(${addressText})`]
        .filter(Boolean)
        .join(" ");
    }
  } else {
    // Unknown strategy type or not selected yet
    if (tokenSymbol || tokenAddress) {
      const addressText = tokenAddress
        ? tokenAddress === ETH_NULL_ADDR
          ? "ETH"
          : tokenAddress
        : "";
      tokenLine = [tokenSymbol ?? "", addressText && `(${addressText})`]
        .filter(Boolean)
        .join(" ");
    }
  }

  // Amount formatting
  const amountLine = amount ?? "[Not specified]";

  // Leverage formatting: only meaningful for pool strategies
  const leverageLine = isPool ? `x${leverage || 1}` : "N/A";

  // Missing parameters detection
  const missing: string[] = [];
  if (!strategy) {
    missing.push("strategy");
  }
  if (isPool && !(tokenSymbol || tokenAddress)) {
    missing.push("token");
  }
  if (!amount) {
    missing.push("amount");
  }

  const status = missing.length === 0 ? "complete" : "needsMoreInfo";

  const missingLine =
    missing.length > 0 ? `\n- Missing Parameters: ${missing.join(", ")}` : "";

  return `### Deposit Intent

- Strategy: ${strategyLine}
- Token: ${tokenLine}
- Amount: ${amountLine}
- Leverage: ${leverageLine}
- Status: ${status}${missingLine}${inferredVaultTokenNote}`;
}

/**
 * Generate deposit intent-aware suggestions
 * This function is registered with the intent and called by IntentManager
 */
export async function generateDepositSuggestions(params: {
  runtime: IAgentRuntime;
  intentContext: IntentContext;
  conversation: string;
  userAddress: `0x${string}`;
  chainId: number;
}): Promise<string> {
  const { runtime, intentContext, conversation, userAddress, chainId } = params;
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  if (!service) {
    throw new Error("LevvaService not found");
  }

  // Fetch all required data in parallel
  // Note: getWalletAssets already fetches availableTokens internally,
  // which populates service.token.tokenMap
  const [positions, strategies, walletAssets] = await Promise.all([
    service.getUserPositions(userAddress, chainId),
    service.strategy.getStrategies(chainId),
    service.wallet.getWalletAssets({ address: userAddress, chainId }),
  ]);

  // Generate prompt using consolidated prompt function
  // Pass component's tokenMap directly - no need to rebuild it!
  return generateDepositIntentSuggestionsPrompt({
    intentContext,
    conversation,
    userAddress,
    chainId,
    returnData: intentContext.returnData || {},
    positions: positions.map((p) => ({
      strategyId: p.strategyId,
      balance: p.balance,
      balanceUsd: p.balanceUsd,
    })),
    strategies: strategies.map((s) => ({
      id: s.id,
      name: s.name,
      risk: s.risk,
      type: s.type,
      vaultUnderlyingToken: s.vault?.underlyingToken.address,
    })),
    walletAssets: walletAssets.map((a) => ({
      token: a.token,
      amount: a.amount,
      value: a.value,
    })),
    tokenMap: service.token.tokenMap, // Use component's map directly!
  });
}

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
      strategy,
      tokenSymbol,
      tokenAddress,
      amount,
      leverage,
    } = (intentContext.returnData as DepositData) || {};

    // Debug logging for parameter extraction
    runtime.logger.info("[DEPOSIT_INTENT] Extracted parameters:", {
      strategyId,
      strategyName,
      strategyType: strategy?.type,
      tokenSymbol,
      tokenAddress,
      amount,
      leverage,
      returnDataKeys: Object.keys(intentContext.returnData || {}),
    });

    // Check if we have all required parameters
    if (!strategy || (!strategyId && !strategyName)) {
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

    const matchedStrategy = strategy; // strategy should be matched in provider

    // For vault strategies, token is determined by the vault's underlyingToken (handled in provider)
    // If token is missing here:
    // - Vault: skip asking for token and proceed to amount question
    // - Pool/Other: ask for token
    if (!tokenSymbol && !tokenAddress) {
      if (
        matchedStrategy?.type === "vault" &&
        matchedStrategy.vault?.underlyingToken
      ) {
        return await handleMissingDepositParameters(
          runtime,
          message,
          state,
          callback,
          intentContext,
          params,
          prevActions,
          "amount",
          matchedStrategy
        );
      }

      return await handleMissingDepositParameters(
        runtime,
        message,
        state,
        callback,
        intentContext,
        params,
        prevActions,
        "token",
        matchedStrategy
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
        "amount",
        matchedStrategy
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
      prevActions,
      matchedStrategy
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
  missingParam?: string,
  matchedStrategy?: StrategyEntry
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

  const positionParams = selectProviderState<PositionParamsProviderData>(
    POSITION_PARAMS_PROVIDER_NAME,
    state
  );

  if (!positionParams) {
    throw new Error("Failed to get position params");
  }
  // Get service for StrategyComponent helpers
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);
  if (!service) {
    throw new Error("Failed to get levva service");
  }

  // Build context-aware response based on what we already know
  let contextualResponse = "";

  if (missingParam === "strategy") {
    const strategiesText = positionParams.strategies
      .map((s) => service.strategy.formatStrategy(s))
      .join("\n");

    // We know they want to deposit but not which strategy
    if (tokenSymbol || tokenAddress) {
      contextualResponse = `I see you want to deposit ${tokenSymbol || "tokens"}.
Which strategy would you like to use?
### Available Strategies
${strategiesText}`;
    } else {
      contextualResponse = `I can help you choose an investment strategy.
### Available Strategies
${strategiesText}`;
    }
  } else if (missingParam === "token") {
    // Use StrategyComponent helper for strategy-specific token logic
    if (matchedStrategy) {
      const tokenResult = service.strategy.autoFillVaultToken(
        matchedStrategy,
        intentContext
      );

      if (tokenResult.autoFilled) {
        // Vault strategy auto-filled token - skip to amount parameter
        contextualResponse = tokenResult.message!;

        return await handleMissingDepositParameters(
          runtime,
          message,
          state,
          callback,
          intentContext,
          params,
          prevActions,
          "amount", // Move to next missing parameter
          matchedStrategy
        );
      } else {
        // Pool strategy or other - ask for token
        contextualResponse = tokenResult.message!;
      }
    } else if (strategyName || strategyRisk) {
      const strategy = strategyName || `${strategyRisk} strategy`;
      contextualResponse = `Great choice on the ${strategy}! Which token would you like to deposit? You can use USDC, ETH, or other tokens from your portfolio.`;
    } else {
      contextualResponse = `Which token would you like to deposit? I can see your available tokens and help you choose.`;
    }
  } else if (missingParam === "amount") {
    // Use StrategyComponent helper for strategy-specific token logic
    let strategy = "strategy";
    let token = "tokens";

    if (matchedStrategy) {
      strategy = matchedStrategy.name || `${matchedStrategy.risk} strategy`;
      token = service.strategy.getTokenForAmountPrompt(
        matchedStrategy,
        tokenSymbol,
        tokenAddress
      );
    } else {
      // Fallback to extracted data
      strategy =
        strategyName ||
        (strategyRisk ? `${strategyRisk} strategy` : "strategy");
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
  prevActions?: any,
  strategy?: StrategyEntry
): Promise<ActionResult> {
  const {
    strategyId,
    strategyName,
    tokenSymbol,
    tokenAddress,
    amount,
    leverage,
  } = depositParams;

  if (!strategy) {
    // should not happen but nevertheless
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
      calldata = await service.strategy.handlePoolStrategy(
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

      // Use StrategyComponent handleVaultStrategy
      calldata = await service.strategy.handleVaultStrategy(
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
            url: `/api/levva/calldata?hash=${calldataHash}`,
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
