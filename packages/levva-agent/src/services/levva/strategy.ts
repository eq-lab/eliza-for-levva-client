import { type IAgentRuntime, logger } from "@elizaos/core";
import { StrategyEntry, VaultConstants, PoolConstants } from "./pool";
import type { LevvaService } from "./class";
import { encodeFunctionData, parseUnits, isHex } from "viem";
import { getChain, getClient, getAllowance } from "../../util";
import { CalldataWithDescription } from "../../types/tx";
import vaultAbi from "./abi/vault.abi";
import { wrapEth } from "src/util/eth/weth";
import poolAbi from "./abi/pool.abi";
import { bundlerEnter } from "./tx";
import { getPendleParams as getPendleParamsImpl } from "./pendle";
import { ETH_NULL_ADDR } from "../../constants/eth";
import { getPendleSwap } from "src/api/swap/pendle";
import { getStrategies as getStrategiesApi } from "../../api/levva";

/**
 * StrategyComponent handles strategy-related functionality
 * Includes both new methods and migrated methods from LevvaService
 */
export class StrategyComponent {
  private runtime: IAgentRuntime;
  private service: LevvaService;

  constructor(runtime: IAgentRuntime, service: LevvaService) {
    this.runtime = runtime;
    this.service = service;
  }

  private getStrategiesKey = (chainId?: number) =>
    `strategies:${chainId ?? "all"}`;

  async getStrategies(chainId?: number): Promise<StrategyEntry[]> {
    const cacheKey = this.getStrategiesKey(chainId);
    const cached = await this.runtime.getCache<StrategyEntry[]>(cacheKey);
    if (cached) return cached;

    const result = await getStrategiesApi(chainId);
    if (!result.success) {
      this.runtime.logger.error("Failed to get strategies", result.error);
      throw new Error("Failed to get strategies");
    }

    this.runtime.logger.debug("Raw strategies data:", {
      count: result.data.length,
      firstStrategy: result.data[0],
    });

    const mapped = result.data
      .filter(
        (x) => Boolean(x.vault)
        // FIXME!!! for now only support vaults; NEED TO FIX POOL IMPLEMENTATION
        // invalidatee cache after fixing pool
      )
      .map<StrategyEntry>((x, index) => {
        try {
          this.runtime.logger.debug(`Processing strategy ${index}:`, {
            id: x.id,
            name: x.name,
            type: x.type,
            risk: x.risk,
            category: x.category,
          });

          const type: any = "vault";
          const strategy: any =
            x.type === "UltraSafe"
              ? "ultra-safe"
              : x.type === "Safe"
                ? "safe"
                : x.type === "Brave"
                  ? "brave"
                  : "custom";

          const contractAddress = x.vault?.address;

          if (!isHex(contractAddress)) {
            throw new Error(
              `Invalid contract address: ${contractAddress} for strategy ${x.id}`
            );
          }

          const strategyEntry: StrategyEntry = {
            type,
            vaultChainId: x.vault?.publicChainId ?? 1,
            contractAddress: contractAddress as `0x${string}`,
            strategy,
            description: x.description,
            id: x.id,
            name: x.name,
            risk: x.risk,
            category: x.category,
            shortDescription: x.shortDescription,
            backgroundColor: x.backgroundColor,
            minimumEfficientDeposit: x.minimumEfficientDeposit,
            apy: x.apy,
            liquidityAvailability: x.liquidityAvailability,
            bonuses: x.bonuses,
            vault: x.vault,
          };

          this.runtime.logger.debug(
            `Successfully processed strategy ${index}:`,
            strategyEntry
          );
          return strategyEntry;
        } catch (error) {
          this.runtime.logger.error(`Error processing strategy ${index}:`, {
            error,
            strategy: x,
          });
          throw error;
        }
      });

    await this.runtime.setCache(cacheKey, mapped);
    return mapped;
  }

  /**
   * Find a strategy by ID, name, or risk level with fuzzy matching support
   * Uses existing LevvaService.getStrategies() method - NO duplication
   * @param strategies - Strategy list from LevvaService.getStrategies()
   * @param criteria - Strategy search criteria
   * @returns The matched strategy or undefined if not found
   */
  /**
   * Find strategy using priority-based matching
   * Priority: contractAddress > strategyId > strategyName > strategyRisk
   *
   * Higher priority fields take precedence - when a higher priority field is present,
   * lower priority fields are ignored to ensure correct strategy selection.
   */
  findStrategy(
    strategies: StrategyEntry[],
    criteria: {
      strategyId?: number;
      strategyName?: string;
      strategyRisk?: string;
      contractAddress?: string;
    }
  ): StrategyEntry | undefined {
    const { strategyId, strategyName, strategyRisk, contractAddress } =
      criteria;

    // Priority 1: Contract address (highest priority)
    if (contractAddress) {
      return strategies.find(
        (s) =>
          s.vault?.address?.toLowerCase() === contractAddress.toLowerCase() ||
          s.pool?.address?.toLowerCase() === contractAddress.toLowerCase()
      );
    }

    // Priority 2: Strategy ID
    if (strategyId !== undefined) {
      return strategies.find((s) => s.id === strategyId);
    }

    // Priority 3: Strategy name
    if (strategyName) {
      return strategies.find(
        (s) =>
          (s.name && s.name.toLowerCase() === strategyName.toLowerCase()) ||
          s.risk.toLowerCase() === strategyName.toLowerCase() ||
          this.matchesStrategyAlias(strategyName, s.risk)
      );
    }

    // Priority 4: Strategy risk (lowest priority)
    if (strategyRisk) {
      return strategies.find(
        (s) =>
          s.risk.toLowerCase() === strategyRisk.toLowerCase() ||
          this.matchesStrategyAlias(strategyRisk, s.risk)
      );
    }

    return undefined;
  }

  /**
   * Check if a user input matches strategy aliases
   * @param userInput - User's strategy input
   * @param strategyRisk - The actual strategy risk level
   * @returns True if the input matches the strategy
   */
  private matchesStrategyAlias(
    userInput: string,
    strategyRisk: string
  ): boolean {
    const input = userInput.toLowerCase();
    const risk = strategyRisk.toLowerCase();

    // Handle "ultra safe" variations
    if (input.includes("ultra") && risk === "ultrasafe") {
      return true;
    }

    // Handle "safe" variations (but not "ultra safe")
    if (input.includes("safe") && !input.includes("ultra") && risk === "safe") {
      return true;
    }

    // Handle "brave" variations
    if (input.includes("brave") && risk === "brave") {
      return true;
    }

    return false;
  }

  /**
   * Get available strategy options as a formatted string for user display
   * Uses provided strategies list - NO duplication of getStrategies()
   * @param strategies - Strategy list from LevvaService.getStrategies()
   * @returns Formatted string of available strategies
   */
  getAvailableStrategiesText(strategies: StrategyEntry[]): string {
    return strategies.map((s) => s.name || s.risk).join(", ");
  }

  /**
   * Auto-detect and fill token information for vault strategies
   * @param strategy - The matched strategy
   * @param intentContext - Intent context to update with token info
   * @returns Object with token info and whether auto-fill occurred
   */
  autoFillVaultToken(
    strategy: StrategyEntry,
    intentContext: any
  ): {
    autoFilled: boolean;
    tokenSymbol?: string;
    tokenAddress?: string;
    message?: string;
  } {
    // Only auto-fill for vault strategies with underlying token info
    if (strategy.type === "vault" && strategy.vault?.underlyingToken) {
      const requiredToken = strategy.vault.underlyingToken.symbol;
      const tokenAddress = strategy.vault.underlyingToken.address;

      // Auto-fill the token information in intent context
      intentContext.returnData = {
        ...intentContext.returnData,
        tokenSymbol: requiredToken,
        tokenAddress: tokenAddress,
      };

      return {
        autoFilled: true,
        tokenSymbol: requiredToken,
        tokenAddress: tokenAddress,
        message: `Perfect! The ${strategy.name} strategy requires ${requiredToken} deposits. I'll use ${requiredToken} for your deposit.`,
      };
    }

    // For pool strategies or when vault info is missing
    return {
      autoFilled: false,
      message: `Great choice on the ${strategy.name}! This ${strategy.type} strategy accepts multiple tokens. Which token would you like to deposit? You can use USDC, ETH, or other tokens from your portfolio.`,
    };
  }

  /**
   * Get strategy-specific token guidance message
   * @param strategy - The matched strategy
   * @returns Contextual message for token selection
   */
  getTokenGuidanceMessage(strategy: StrategyEntry): string {
    if (strategy.type === "vault" && strategy.vault?.underlyingToken) {
      const requiredToken = strategy.vault.underlyingToken.symbol;
      return `Perfect! The ${strategy.name} strategy requires ${requiredToken} deposits. I'll use ${requiredToken} for your deposit.`;
    } else if (strategy.type === "pool") {
      return `Great choice on the ${strategy.name}! This pool strategy accepts multiple tokens. Which token would you like to deposit? You can use USDC, ETH, or other tokens from your portfolio.`;
    } else {
      return `Great choice on the ${strategy.name}! Which token would you like to deposit? You can use USDC, ETH, or other tokens from your portfolio.`;
    }
  }

  /**
   * Get the appropriate token symbol for amount prompts
   * @param strategy - The matched strategy
   * @param fallbackTokenSymbol - Fallback token symbol from intent data
   * @param fallbackTokenAddress - Fallback token address from intent data
   * @returns Token symbol to use in amount prompts
   */
  getTokenForAmountPrompt(
    strategy: StrategyEntry,
    fallbackTokenSymbol?: string,
    fallbackTokenAddress?: string
  ): string {
    // For vault strategies, use the vault's underlying token
    if (strategy.type === "vault" && strategy.vault?.underlyingToken) {
      return strategy.vault.underlyingToken.symbol;
    }

    // For pool strategies or when vault info is missing, use extracted token
    return (
      fallbackTokenSymbol ||
      (fallbackTokenAddress !== "0x0000000000000000000000000000000000000000"
        ? fallbackTokenAddress
        : "ETH") ||
      "tokens"
    );
  }

  /**
   * Format strategy information for display
   * @param strategy - The strategy to format
   * @returns Formatted strategy string
   */
  formatStrategy(strategy: StrategyEntry): string {
    return `- ${strategy.strategy} - Contract: ${strategy.contractAddress}. Type: "${strategy.type}". ${strategy.description} `;
  }

  /**
   * Get strategy-specific data (vault or pool constants)
   * @param strategy - The strategy to get data for
   * @returns Strategy data with type information
   */
  async getStrategyData(
    strategy: StrategyEntry
  ): Promise<
    | { type: "vault"; data: VaultConstants }
    | { type: "pool"; data: PoolConstants }
  > {
    if (strategy.type === "vault") {
      return {
        type: "vault",
        data: await this.service.getVaultConstants(
          strategy.vaultChainId,
          strategy.contractAddress
        ),
      };
    }

    return {
      type: "pool",
      data: await this.service.getPoolConstants(
        strategy.vaultChainId,
        strategy.contractAddress
      ),
    };
  }

  async handleVaultStrategy(
    strategy: StrategyEntry,
    sender: `0x${string}`,
    amount: string,
    wrap?: boolean
  ) {
    const { type, vaultChainId: chainId, contractAddress: address } = strategy;

    if (type !== "vault") {
      throw new Error(`Strategy ${address} is not a vault`);
    }

    const vault = await this.service.getVaultConstants(chainId, address);
    const calls: CalldataWithDescription[] = [];

    const tokenIn = await this.service.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: vault.asset,
    });

    if (!tokenIn?.address) {
      throw new Error(`Token ${vault.asset} not found`);
    }

    let amountIn = parseUnits(amount, tokenIn.decimals);

    const balance = await this.service.getBalanceOf(
      sender,
      chainId,
      tokenIn.address
    );

    if (wrap) {
      const weth = await this.service.getWETH(chainId);

      if (weth.address !== vault.asset) {
        throw new Error(`Vault ${address} is not a WETH vault`);
      }

      calls.push(wrapEth(amountIn, weth));
      amountIn = parseUnits(amount, weth.decimals);
    }

    if ((balance?.amount ?? BigInt(0)) < amountIn) {
      throw new Error(
        `Insufficient balance, consider swapping to ${tokenIn.symbol} first`
      );
    }

    const client = getClient(getChain(chainId));

    const { approve } = await getAllowance({
      sender,
      spender: address,
      token: tokenIn.address,
      amount: amountIn,
      client,
      decimals: tokenIn.decimals,
      symbol: tokenIn.symbol,
    });

    if (approve) {
      calls.push(approve);
    }

    const calldata = encodeFunctionData({
      abi: vaultAbi,
      functionName: "deposit",
      args: [amountIn, sender],
    });

    calls.push({
      to: address,
      data: calldata,
      title: `Deposit ${amount} ${tokenIn.symbol}`,
      description: `Depositing ${amount} ${tokenIn.symbol} to vault ${address}`,
    });

    return calls;
  }

  async handlePoolStrategy(
    strategy: StrategyEntry,
    receiver: `0x${string}`,
    tokenSymbolOrAddress: string,
    amount: string,
    _leverage?: number
  ) {
    if (!_leverage) {
      logger.warn("No leverage provided, using default(x5)");
    }

    const leverage = _leverage ?? 5;
    const {
      type,
      vaultChainId: chainId,
      contractAddress: address,
      bundler,
    } = strategy;

    if (type !== "pool") {
      throw new Error(`Strategy ${address} is not a pool`);
    }

    const pool = await this.service.getPoolConstants(chainId, address);

    const calls: CalldataWithDescription[] = [];

    let tokenIn = await this.service.getTokenDataWithInfo({
      chainId,
      symbolOrAddress: tokenSymbolOrAddress,
    });

    let amountIn = parseUnits(amount, tokenIn?.decimals ?? 18);

    const balance = await this.service.getBalanceOf(
      receiver,
      chainId,
      tokenIn?.address ?? ETH_NULL_ADDR
    );

    if ((balance?.amount ?? BigInt(0)) < amountIn) {
      throw new Error("Insufficient balance");
    }

    if (!tokenIn?.address) {
      logger.warn(`using WETH`);
      const weth = await this.service.getWETH(chainId);

      tokenIn = await this.service.getTokenDataWithInfo({
        chainId,
        symbolOrAddress: weth.symbol,
      });

      calls.push(wrapEth(amountIn, weth));
      amountIn = parseUnits(amount, weth.decimals);
    }

    const client = getClient(getChain(chainId));

    const basePriceX96 = await client.readContract({
      address,
      abi: poolAbi,
      functionName: "getLiquidationPrice",
    });

    const limitPriceX96 = (basePriceX96.inner * BigInt(100)) / BigInt(95);

    if (bundler && tokenIn?.address !== pool.baseToken) {
      const pendle = await getPendleParamsImpl.call(this.service, chainId, {
        baseToken: pool.baseToken,
        quoteToken: pool.quoteToken,
      });

      const market = pendle?.market;
      if (!market) {
        throw new Error(
          `Market not found for ${pool.baseToken} and ${pool.quoteToken}`
        );
      }

      if (!tokenIn?.address) {
        throw new Error("weth error");
      }

      const swap = await getPendleSwap({
        chainId: chainId.toString() as `${number}`,
        market,
        receiver,
        slippage: "0.05" as `${number}`,
        enableAggregator: "true",
        tokenIn: tokenIn.address,
        tokenOut: pool.baseToken,
        amountIn: amountIn.toString() as `${number}`,
      });

      if (!swap) {
        throw new Error(
          `Failed to swap ${amountIn.toString()} ${tokenIn?.symbol} to ${pool.baseToken}`
        );
      }

      logger.debug(`Swap: ${JSON.stringify(swap, null, 2)}`);

      if (leverage < 1) {
        throw new Error("Leverage must be greater than 1");
      }

      const longAmount = BigInt(swap.data.amountOut) * BigInt(leverage - 1);

      const { approve } = await getAllowance({
        sender: receiver,
        spender: bundler,
        token: tokenIn.address,
        amount: amountIn,
        client,
        decimals: tokenIn.decimals,
        symbol: tokenIn.symbol,
      });

      if (approve) {
        calls.push(approve);
      }

      const calldata = bundlerEnter(swap, {
        pool: address,
        longAmount,
        limitPriceX96,
      });

      calls.push({
        to: bundler,
        data: calldata,
        title: `Deposit ${amount} ${tokenIn.symbol}`,
        description: `Entering pool ${address} with ${amountIn.toString()} ${tokenIn?.symbol} and x${leverage} leverage`,
      });

      return calls;
    }

    if (tokenIn?.address === pool.baseToken) {
      if (leverage < 1) {
        throw new Error("Leverage must be greater than 1");
      }

      const longAmount = BigInt(amountIn) * BigInt(leverage - 1);

      const { approve } = await getAllowance({
        sender: receiver,
        spender: address,
        token: tokenIn.address,
        amount: amountIn,
        client,
        decimals: tokenIn.decimals,
        symbol: tokenIn.symbol,
      });

      if (approve) {
        calls.push(approve);
      }

      const defaultSwapCalldata = await client.readContract({
        abi: poolAbi,
        address,
        functionName: "defaultSwapCallData",
      });

      const calldata = encodeFunctionData({
        abi: poolAbi,
        functionName: "execute",
        args: [
          0 /* DEPOSIT_BASE */,
          amountIn,
          longAmount,
          limitPriceX96,
          false,
          ETH_NULL_ADDR,
          BigInt(defaultSwapCalldata),
        ],
      });

      calls.push({
        to: address,
        data: calldata,
        title: `Deposit ${amount} ${tokenIn.symbol}`,
        description: `Depositing ${amountIn.toString()} ${tokenIn.symbol} to pool ${address} with x${leverage} leverage`,
      });

      return calls;
    }

    throw new Error(
      `deposit of token ${tokenIn?.symbol} to pool ${address} is not supported, please swap into ${pool.baseToken} first or use bundler`
    );
  }
}
