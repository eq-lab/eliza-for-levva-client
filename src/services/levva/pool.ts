import poolAbi from "./abi/pool.abi";
import { getChain, getClient } from "../../util";
import vaultAbi from "./abi/vault.abi";
import { logger } from "@elizaos/core";

// fixme rename module to strategy?

export type CoreStrategy = "ultra-safe" | "safe" | "brave";
export type CustomStrategy = "custom";
export type Strategy = CoreStrategy | CustomStrategy;
export type StrategyType = "vault" | "pool";

export interface StrategyMapping {
  description: string;
  contractAddress: `0x${string}`;
  vaultChainId: number;
  type: StrategyType;
  bundler?: `0x${string}`;
}

export interface StrategyEntry extends StrategyMapping {
  strategy: Strategy;
  id: number;
  name: string;
  risk: string;
  category: string;
  shortDescription: string;
  backgroundColor: string | null;
  minimumEfficientDeposit: number;
  apy?: number;
  liquidityAvailability: string;
  bonuses?: Array<{
    bonusType: string;
    amountType?: string;
    amount: number;
  }>;
  vault?: {
    id: number;
    publicChainId: number;
    address: string;
    name: string | null;
    underlyingToken: {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      priceUsd: number;
      protocol?: string;
      bonuses?: Array<{
        bonusTypeId?: number;
        bonusType: string;
        amount: number;
        amountType?: string;
      }>;
    };
    lpToken: {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      priceUsd: number;
      protocol?: string;
      bonuses?: Array<{
        bonusTypeId?: number;
        bonusType: string;
        amount: number;
        amountType?: string;
      }>;
    };
    lpTotalSupply: number;
    performanceFee: number;
    managementFee: number;
    totalAssets: number;
    currentApy: number;
    minDeposit: number;
    createdAt: string;
  };
}

export const getPoolConstants = async (
  chainId: number,
  address: `0x${string}`
) => {
  const chain = getChain(chainId);
  const client = getClient(chain);
  logger.debug(`Getting pool constants for ${address}`);

  const [baseToken, defaultSwapCallData, quoteToken] = await Promise.all([
    client.readContract({
      abi: poolAbi,
      address,
      functionName: "baseToken",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "defaultSwapCallData",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "quoteToken",
    }),
  ]);

  const result = {
    baseToken,
    defaultSwapCallData: defaultSwapCallData.toString(),
    quoteToken,
  };

  logger.debug(`Pool constants: ${JSON.stringify(result)}`);

  return result;
};

export const getPoolVariables = async (
  chainId: number,
  address: `0x${string}`
) => {
  const chain = getChain(chainId);
  const client = getClient(chain);

  const [
    baseCollateralCoeff,
    baseDebtCoeff,
    baseDelevCoeff,
    discountedBaseCollateral,
    discountedBaseDebt,
    discountedQuoteCollateral,
    discountedQuoteDebt,
    price,
    quoteCollateralCoeff,
    quoteDebtCoeff,
    quoteDelevCoeff,
  ] = await Promise.all([
    client.readContract({
      abi: poolAbi,
      address,
      functionName: "baseCollateralCoeff",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "baseDebtCoeff",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "baseDelevCoeff",
    }),
    client.readContract({
      abi: poolAbi,
      address,
      functionName: "discountedBaseCollateral",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "discountedBaseDebt",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "discountedQuoteCollateral",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "discountedQuoteDebt",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "getLiquidationPrice",
    }),
    client.readContract({
      abi: poolAbi,
      address,
      functionName: "quoteCollateralCoeff",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "quoteDebtCoeff",
    }),

    client.readContract({
      abi: poolAbi,
      address,
      functionName: "quoteDelevCoeff",
    }),
  ]);

  return {
    baseCollateralCoeff: baseCollateralCoeff,
    baseDebtCoeff: baseDebtCoeff,
    baseDelevCoeff: baseDelevCoeff,
    discountedBaseCollateral,
    discountedBaseDebt,
    discountedQuoteCollateral,
    discountedQuoteDebt,
    price: price.inner,
    quoteCollateralCoeff,
    quoteDebtCoeff,
    quoteDelevCoeff,
  };
};

export const getVaultConstants = async (
  chainId: number,
  address: `0x${string}`
) => {
  const chain = getChain(chainId);
  const client = getClient(chain);

  const asset = await client.readContract({
    abi: vaultAbi,
    address,
    functionName: "asset",
  });

  return {
    asset,
  };
};

export type PoolConstants = Awaited<ReturnType<typeof getPoolConstants>>;
export type PoolVariables = Awaited<ReturnType<typeof getPoolVariables>>;
export type VaultConstants = Awaited<ReturnType<typeof getVaultConstants>>;

export interface PoolDescription {
  chainId: number;
  address: `0x${string}`;
  description: string;
  /** @deprecated fixme should not use mockup data in future */
  mock?: PoolConstants;
}

export interface LevvaPoolInterface {
  getStrategies: (chainId?: number) => Promise<StrategyEntry[]>;

  getPoolConstants: (
    chainId: number,
    address: `0x${string}`
  ) => Promise<PoolConstants>;

  getPoolVariables: (
    chainId: number,
    address: `0x${string}`
  ) => Promise<PoolVariables>;

  getVaultConstants: (
    chainId: number,
    address: `0x${string}`
  ) => Promise<VaultConstants>;
}
