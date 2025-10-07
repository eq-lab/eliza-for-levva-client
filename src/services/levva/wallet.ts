import { and, eq, gte, InferSelectModel } from "drizzle-orm";
import { getAddress, parseUnits, formatUnits } from "viem";
import { type IAgentRuntime, ServiceType } from "@elizaos/core";
import type { LevvaService } from "./class";
import { PROXIES } from "./constants";
import { BackgroundQueue } from "./background-queue";
import { BrowserService } from "../browser";
import { ETH_NULL_ADDR } from "../../constants/eth";
import { USD_DECIMALS } from "../../constants/math";
import { balancesTable } from "../../schema/balances";
import type { CacheEntry } from "../../types/core";
import { blockexplorers, getDb, TokenEntry, getBalanceOf } from "../../util";

export type BalanceEntry = InferSelectModel<typeof balancesTable>;

interface GetBalanceParams {
  chainId: number;
  address: `0x${string}`;
  ttl?: number;
}

export const getBalance = async (
  runtime: IAgentRuntime,
  params: GetBalanceParams
) => {
  const db = getDb(runtime);

  return db
    .select()
    .from(balancesTable)
    .where(
      params.ttl
        ? and(
            gte(balancesTable.updatedAt, new Date(Date.now() - params.ttl)),
            eq(balancesTable.address, getAddress(params.address)),
            eq(balancesTable.chainId, params.chainId)
          )
        : and(
            eq(balancesTable.address, getAddress(params.address)),
            eq(balancesTable.chainId, params.chainId)
          )
    );
};

interface UpsertBalanceParams {
  chainId: number;
  address: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  value: bigint;
}

export const upsertBalance = async (
  runtime: IAgentRuntime,
  params: UpsertBalanceParams
) => {
  const db = getDb(runtime);
  const now = new Date();
  const { address, token, ...rest } = params;

  return (
    await db
      .insert(balancesTable)
      .values({
        ...rest,
        address: getAddress(address),
        type: token && token !== ETH_NULL_ADDR ? "erc20" : "native",
        token: token ? getAddress(token) : ETH_NULL_ADDR,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          balancesTable.chainId,
          balancesTable.address,
          balancesTable.token,
        ],
        set: {
          ...rest,
          updatedAt: now,
        },
      })
      .returning()
  )?.[0];
};

export interface AssetEntry {
  address?: `0x${string}`;
  symbol: string;
  balance: string;
  value: string;
}

/** @deprecated fetching in browser needs new proxies constantly */
export async function fetchAssetsFromExplorer(
  runtime: IAgentRuntime,
  address: `0x${string}`,
  chainId: number
) {
  const browser = await runtime.getService<BrowserService>(ServiceType.BROWSER);
  const explorer = blockexplorers.get(chainId);

  if (!browser) {
    throw new Error("Browser service not found");
  }

  if (!explorer) {
    throw new Error(
      `Unsupported chain ${chainId}, reason = block explorer not found`
    );
  }

  const url = `${explorer}/address/${address}`;
  const cacheKey = `portfolio:${address}:${chainId}`;
  // timed cache, todo make util function
  const cacheTime = 3600000;
  const timestamp = Date.now();

  // todo replace cache with balances table
  const cached = await runtime.getCache<CacheEntry<AssetEntry[]>>(cacheKey);

  if (cached?.timestamp && timestamp - cached.timestamp < cacheTime) {
    return cached.value;
  }

  const portfolio = await browser.processPageContent(
    url,
    async (html) => {
      const begin = html.indexOf("<!-- Content");
      const end = html.indexOf("<!-- End Content");
      return `<task>analyze given html and extract the wallet assets</task>
        <html>
          ${html.slice(begin, end)}
        </html>
        <instructions>
          - Find the DIV block titled "ETH Balance" and extract the balance.
          - Find the DIV block titled "Token Holdings" and extract the balances and addresses of tokens in dropdown.
        </instructions>
        <keys>
          - "assets" should be an array of objects with the following keys:
            - "symbol"
            - "balance"
            - "value"
            - "address" (optional for native token)
        </keys>
        <output>
          Respond using JSON format like this:
          {
            "assets": [
              {
                "symbol": "ETH",
                "balance": "0.03400134",
                "value": "80.2"
              },
              {
                "symbol": "USDT",
                "balance: "20.1234",
                "value": "20.111223344",
                "address": "0xdac17f958d2ee523a2206206994597c13d831ec7",
              }
            ]
          }
        </output>
        `;
    },
    "html",
    PROXIES
  );

  // todo type check
  const assets: AssetEntry[] = portfolio?.assets ?? [];

  await runtime.setCache(cacheKey, {
    timestamp,
    value: assets,
  });

  return assets;
}

export interface BalanceData {
  amount: bigint;
  address: `0x${string}`;
  token: `0x${string}`;
  chainId: number;
  value: bigint;
}

export class WalletServiceComponent extends BackgroundQueue<BalanceData> {
  // Balance operation constants
  private BALANCE_PREFIX = "wallet-balance:";
  private service: LevvaService;
  constructor(runtime: IAgentRuntime, service: LevvaService) {
    super(runtime);
    this.service = service;
  }

  cleanup() {
    // Cleanup base queue functionality
    this.cleanupQueue();

    this.runtime.logger.info("WalletServiceComponent cleanup completed");
  }

  // Balance operation helpers
  private createBalanceId = (params: {
    address: `0x${string}`;
    chainId: number;
    token: `0x${string}` | undefined;
  }) => {
    return `${this.BALANCE_PREFIX}${params.address}:${params.chainId}:${params.token ?? "native"}`;
  };

  // Implementation of abstract method from BackgroundQueue
  protected onBackgroundResolved = async (event: {
    id: string;
    value: BalanceData;
  }) => {
    // All events in this queue are balance updates
    await upsertBalance(this.runtime, event.value);
    this.runtime.logger.debug(`Updated balance for ${event.id}`, event.value);
  };

  // Balance fetching with queue system
  getBalanceOf = (
    address: `0x${string}`,
    chainId: number,
    token: `0x${string}`
  ) => {
    const id = this.createBalanceId({
      address,
      chainId,
      token,
    });

    return this.inBackground(id, async () => {
      const amount = await getBalanceOf(chainId, address, token);

      // Get token data from external API
      let value = BigInt(0);
      let decimals = 18; // Default
      let _token = token;

      if (token === ETH_NULL_ADDR) {
        _token = (await this.service.getWETH(chainId)).address as `0x${string}`;
        decimals = 18;
      }

      const tokenData = await this.service.token.getExternalTokenData(
        _token,
        chainId
      );

      if (tokenData) {
        decimals = tokenData.decimals;

        if (tokenData.priceUsd) {
          // Convert priceUsd to string without scientific notation
          const priceUsdString = tokenData.priceUsd.toFixed(USD_DECIMALS);
          const priceUsdBigInt = parseUnits(priceUsdString, USD_DECIMALS);
          value = (amount * priceUsdBigInt) / BigInt(10) ** BigInt(decimals);
        }
      }

      return {
        amount,
        address,
        token,
        chainId,
        value,
      };
    });
  };

  async getWalletAssets(params: {
    address: `0x${string}`;
    chainId: number;
  }): Promise<BalanceData[]> {
    const ttl = 900000; // update balance if older than 15 minutes

    const [balances, availableTokens] = await Promise.all([
      getBalance(this.runtime, {
        address: params.address,
        chainId: params.chainId,
        ttl,
      }),
      // Use TokenServiceComponent's method which includes native currency and populates tokenMap
      this.service.token.getAvailableTokens({ chainId: params.chainId }),
    ]);

    const withBalance = new Set<string>(balances.map(({ token }) => token));
    const missingTokens = availableTokens.filter(
      ({ address }) => !withBalance.has(address ?? ETH_NULL_ADDR)
    );

    this.runtime.logger.info(
      `Found ${balances.length} existing balances, ${missingTokens.length} missing tokens for ${params.address}`
    );

    // Fetch missing token balances using queue system
    // Note: Background queue automatically saves via onBackgroundResolved
    const missingBalanceData = await Promise.all(
      missingTokens.map((token) => {
        const tokenAddress = (token.address ?? ETH_NULL_ADDR) as `0x${string}`;
        return this.getBalanceOf(params.address, params.chainId, tokenAddress);
      })
    );

    // Combine existing balances from DB with newly fetched ones
    const allBalances: BalanceData[] = [
      ...balances.map((b) => ({
        amount: b.amount,
        address: b.address as `0x${string}`,
        token: b.token as `0x${string}`,
        chainId: b.chainId,
        value: b.value,
      })),
      ...missingBalanceData.filter((b): b is BalanceData => b !== undefined),
    ];

    // Filter out zero balances
    return allBalances.filter((b) => b.amount > 0n);
  }

  formatToken(token: Omit<TokenEntry, "id">): string {
    return `${token.symbol} (${token.name}) - ${token.address ?? "Native"} - ${token.decimals} decimals`;
  }

  formatWalletAssets(assets: BalanceData[], hideZero?: boolean): string {
    const filteredAssets = hideZero
      ? assets.filter((asset) => asset.amount > 0n)
      : assets;

    if (filteredAssets.length === 0) {
      return "No assets found in wallet.";
    }

    const formatted = filteredAssets
      .map((asset) => {
        // Use tokenMap to get proper decimals and symbol
        const tokenData = this.service.token.getTokenFromMap({
          chainId: asset.chainId,
          address: asset.token,
        });

        const decimals = tokenData?.decimals ?? 18;
        const symbol = tokenData?.symbol ?? asset.token;
        const amount = formatUnits(asset.amount, decimals);
        const value = formatUnits(asset.value, USD_DECIMALS);

        return `${symbol}: ${Number(amount).toFixed(6)} (≈$${Number(value).toFixed(2)})`;
      })
      .join("\n");

    return `Wallet Assets:\n${formatted}`;
  }
}
