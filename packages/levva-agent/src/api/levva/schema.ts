import { z } from "zod";

const bonusSchema = z.object({
  bonusTypeId: z.number().optional(),
  bonusType: z.string(),
  amount: z.number(),
  amountType: z.string().optional(),
});

const tokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  priceUsd: z.number(),
  protocol: z.string().nullable().optional(),
  bonuses: z.array(bonusSchema).optional(),
});

const pendleMarketSchema = z.object({
  pendleMarketAddress: z.string(),
  underlyingAssetName: z.string(),
  underlyingAssetSymbol: z.string(),
  underlyingType: z.enum(["Stable", "BTC", "ETH", "Other"]),
  maturityDate: z
    .string()
    .transform((val) => (val.endsWith("Z") ? val : `${val}Z`)),
  impliedApy: z.number(),
  liquidity: z.number(),
  capacity: z.number(),
  capacityUsd: z.number(),
  poolAddress: z.string(),
  totalQuoteLent: z.number(),
  totalQuoteBorrowed: z.number(),
  utilizationRate: z.number(),
  currentInterestRate: z.number(),
  leverage: z.number(),
  lenderInterest: z.number(),
  spread: z.number(),
  publicChainId: z.number(),
  updatedAt: z.string(),
});

export const strategiesResponseSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    shortDescription: z.string(),
    backgroundColor: z.string().nullable(),
    type: z.string(),
    category: z.string(),
    risk: z.string(),
    minimumEfficientDeposit: z.number(),
    apy: z.number().optional(),
    liquidityAvailability: z.string(),
    bonuses: z.array(bonusSchema).optional(),
    vault: z
      .object({
        id: z.number(),
        publicChainId: z.number(),
        address: z.string(),
        name: z.string().nullable(),
        underlyingToken: tokenSchema,
        lpToken: tokenSchema,
        lpTotalSupply: z.number(),
        performanceFee: z.number(),
        managementFee: z.number(),
        totalAssets: z.number(),
        currentApy: z.number(),
        minDeposit: z.number(),
        createdAt: z.string(),
      })
      .optional(),
  })
);

export type StrategiesResponse = z.infer<typeof strategiesResponseSchema>;

// User positions schema - based on actual API response
export const userPositionSchema = z.object({
  strategyId: z.number(),
  balance: z.number(),
  balanceUsd: z.number(),
  hasPendingWithdrawals: z.boolean(),
});

export const userPositionsResponseSchema = z.array(userPositionSchema);

// Withdrawal request schema - based on actual API response
export const withdrawalRequestSchema = z.object({
  vaultAddress: z.string(),
  withdrawalNftAddress: z.string(),
  requestId: z.number(),
  isFinalized: z.boolean(),
  amount: z.number(),
  strategyId: z.number(),
});

export const withdrawalRequestsResponseSchema = z.array(
  withdrawalRequestSchema
);

// Token response schema
export const tokenResponseSchema = tokenSchema;
export const tokensResponseSchema = z.array(tokenSchema);

// Pendle market response schema
export const pendleMarketResponseSchema = z.array(pendleMarketSchema);

export type Token = z.infer<typeof tokenSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export type UserPosition = z.infer<typeof userPositionSchema>;
export type UserPositionsResponse = z.infer<typeof userPositionsResponseSchema>;
export type WithdrawalRequest = z.infer<typeof withdrawalRequestSchema>;
export type WithdrawalRequestsResponse = z.infer<
  typeof withdrawalRequestsResponseSchema
>;
export type PendleMarket = z.infer<typeof pendleMarketSchema>;
