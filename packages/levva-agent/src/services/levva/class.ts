import assert from "node:assert";
import { encodeFunctionData, sha256, toHex } from "viem";
import {
  Content,
  Entity,
  type IAgentRuntime,
  Service,
  ServiceType,
  UUID,
} from "@elizaos/core";
import { LEVVA_SERVICE } from "../../constants/enum";
import { ILevvaService } from "../../types/service";
import { CalldataWithDescription } from "../../types/tx";
import { upsertTokens } from "../../util/db";
import {
  getLevvaUser,
  getToken as getTokenImpl,
  getTokensData,
  TokenEntry,
} from "../../util";
import { ETH_NULL_ADDR } from "../../constants/eth";
// News imports removed - now handled by NewsServiceComponent
import {
  getPoolConstants,
  getPoolVariables as getPoolVariablesImpl,
  getVaultConstants,
} from "./pool";
import { StrategyComponent } from "./strategy";
import { WalletServiceComponent } from "./wallet";
import vaultAbi from "./abi/vault.abi";
import withdrawalNftAbi from "./abi/vault.withdrawal-nft.abi";
import { getChannelByName, getMessages } from "./messages";
import {
  getActivePendleMarkets,
  getUserPositions,
  getWithdrawalRequests,
} from "../../api/levva";
import { createPositionSummary } from "./positions";
import { checkSecret } from "./secrets";
import { TokenServiceComponent } from "./token";
import { NewsServiceComponent } from "./news-component";
import { createTimedCache, createPermanentCache } from "./cache-util";
import { getPendleMarketPtTokens } from "./pendle";
import { PendleMarket } from "../../api/levva/schema";
import { getPendleMarketSupportedTokens } from "../../api/pendle";
import { TokenData } from "../../types/token";
import { RedisService } from "../redis";

const REQUIRED_PLUGINS = ["levva"];

function checkPlugins(runtime: IAgentRuntime) {
  const set = new Set(runtime.plugins.map((plugin) => plugin.name));
  return REQUIRED_PLUGINS.every((plugin) => set.has(plugin));
}

export class LevvaService extends Service implements ILevvaService {
  public readonly runtime: IAgentRuntime;

  // Service composition components - NEW functionality only
  public readonly strategy: StrategyComponent;
  public readonly token: TokenServiceComponent;
  public readonly wallet: WalletServiceComponent;
  public readonly news: NewsServiceComponent;

  static serviceType = LEVVA_SERVICE.LEVVA_COMMON;
  capabilityDescription =
    "Levva service should analyze the user's portfolio, suggest earning strategies, swap crypto assets, etc.";

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.runtime = runtime; // making public until fix
    assert(checkPlugins(runtime), "Required plugins not found");

    const redisService = runtime.getService<RedisService>(ServiceType.KV_STORE);
    if (!redisService) {
      throw new Error("Redis service not found");
    }

    // Initialize NEW service components - pass service instance to constructor
    this.strategy = new StrategyComponent(runtime, this);
    this.token = new TokenServiceComponent(runtime);
    this.wallet = new WalletServiceComponent(runtime, this, redisService);
    this.news = new NewsServiceComponent(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    runtime.logger.info("*** Starting Levva service ***");
    const service = new LevvaService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    runtime.logger.info("*** Stopping Levva service ***");
    // get the service from the runtime
    const service = runtime.getService(LevvaService.serviceType);

    if (!service) {
      throw new Error("Levva service not found");
    }

    service.stop();
  }

  async stop() {
    this.runtime.logger.info("*** Stopping levva service instance ***");

    // Cleanup components
    this.token.cleanup();
    this.news.cleanup();
  }

  getUser = async (address: `0x${string}`) => {
    const [user] = await getLevvaUser(this.runtime, { address });
    return user as typeof user | undefined;
  };

  getUserById = async (id: UUID) => {
    const [user] = await getLevvaUser(this.runtime, { id });
    return user as typeof user | undefined;
  };

  getChannelByName = (name: string) => getChannelByName(this.runtime, name);
  // do we need it? or better to use runtime.getMemoryById?
  getMessages = (params: Parameters<typeof getMessages>[1]) =>
    getMessages(this.runtime, params);
  checkSecret = (secret: string) => checkSecret(this.runtime, secret);

  // TOKEN BLOCK - Delegated to TokenComponent
  /** @deprecated Use this.token.getToken() directly instead */
  getToken = (params: Parameters<typeof getTokenImpl>[1]) =>
    this.token.getToken(params);

  /** @deprecated Use this.token.getTokenDataWithInfo() directly instead */
  getTokenDataWithInfo = (params: {
    chainId: number;
    symbolOrAddress?: string;
  }) => this.token.getTokenDataWithInfo(params);

  /** @deprecated Use this.token.getWETH() directly instead */
  getWETH = (chainId: number) => this.token.getWETH(chainId);

  /** @deprecated Use this.token.getAvailableTokens() directly instead */
  getAvailableTokens = (params: { chainId: number }) =>
    this.token.getAvailableTokens(params);

  /** @deprecated Use this.wallet.formatToken() directly instead */
  formatToken = (token: {
    symbol: string;
    name: string;
    address?: string;
    decimals: number;
    info?: unknown;
  }) =>
    this.wallet.formatToken({
      ...token,
      address: token.address ?? ETH_NULL_ADDR,
      chainId: 1, // Default chainId for backward compatibility
      info: token.info ?? {},
    } as Omit<TokenEntry, "id">);

  /** @deprecated Use this.token.getExternalTokenData() directly instead */
  getExternalTokenData = (tokenAddress: `0x${string}`, chainId: number) =>
    this.token.getExternalTokenData(tokenAddress, chainId);

  /** @deprecated Use this.token.getTokenFromMap() directly instead */
  private getTokenFromMap = (params: {
    chainId: number;
    address: `0x${string}`;
  }) => this.token.getTokenFromMap(params);
  // END TOKEN BLOCK

  // -- Wallet assets --

  /** @deprecated Use this.wallet.getWalletAssets() directly instead */
  getWalletAssets = (params: { address: `0x${string}`; chainId: number }) =>
    this.wallet.getWalletAssets(params);

  // -- End of Wallet Assets --
  // -- Crypto news --

  /** @deprecated Use this.news.getCryptoNews() directly instead */
  getCryptoNews = (limit?: number) => this.news.getCryptoNews(limit);

  /** @deprecated Use this.news.fetchFeed() directly instead */
  fetchFeed = (url: string) => this.news.fetchFeed(url);

  // -- End of Crypto news --

  // -- Position Management --
  private getUserPositionsCacheKey = (
    address: `0x${string}`,
    chainId?: number
  ) => `user-positions:${address}:${chainId ? chainId : "all"}`;

  invalidateUserPositionsCache = (address: `0x${string}`, chainId?: number) =>
    this.runtime.deleteCache(this.getUserPositionsCacheKey(address, chainId));

  getUserPositions = createTimedCache(
    this,
    300000, // 5 minutes TTL
    async (address: `0x${string}`, chainId?: number) => {
      const result = await getUserPositions(address, chainId);
      if (result.success) {
        return result.data;
      } else {
        this.runtime.logger.warn(
          "Failed to parse user positions response:",
          result.error
        );
        return [];
      }
    },
    this.getUserPositionsCacheKey
  );

  invalidateWithdrawalRequestsCache = (
    address: `0x${string}`,
    chainId: number
  ) =>
    this.runtime.deleteCache(
      this.getWithdrawalRequestsCacheKey(address, chainId)
    );

  private getWithdrawalRequestsCacheKey = (
    address: `0x${string}`,
    chainId: number
  ) => `withdrawal-requests:${address}:${chainId}`;

  getWithdrawalRequests = createTimedCache(
    this,
    300000, // 5 minutes TTL
    async (address: `0x${string}`, chainId: number) => {
      const result = await getWithdrawalRequests(address, chainId);
      if (result.success) {
        return result.data;
      } else {
        this.runtime.logger.warn(
          "Failed to parse withdrawal requests response:",
          result.error
        );
        return [];
      }
    },
    this.getWithdrawalRequestsCacheKey
  );

  async getPositionSummary(address: `0x${string}`, chainId: number) {
    const [positions, withdrawals, strategies] = await Promise.all([
      this.getUserPositions(address, chainId),
      this.getWithdrawalRequests(address, chainId),
      this.strategy.getStrategies(chainId),
    ]);

    return {
      summary: createPositionSummary(positions, withdrawals, strategies),
      positions,
      withdrawals,
      strategies,
    };
  }

  // -- End of Position Management --

  // -- Pendle Strategies --
  getPendleMarkets = createTimedCache(
    this,
    3600000, // 1 hour in milliseconds
    async (chainId: number) => {
      const result = await getActivePendleMarkets(chainId);
      const supportedUnderlyingTypes = ["Stable", "ETH", "BTC"];

      if (!result.success) {
        throw new Error("Failed to get Pendle markets");
      }

      return result.data.filter((market) =>
        supportedUnderlyingTypes.includes(market.underlyingType)
      );
    },
    (chainId: number) => `pendle-markets:${chainId}`
  );

  async filterPendleMarkets(
    pendleMarkets: PendleMarket[],
    tokenOut?: string,
    maturityDays?: string,
    tokenClass?: string
  ): Promise<PendleMarket[]> {
    const utcNowDate = Date.now();
    const utcNowDateInMsec = Math.floor(
      utcNowDate - Math.floor(utcNowDate % 86400000)
    );

    return pendleMarkets.filter((market) => {
      const maturityDate = new Date(market.maturityDate);
      const daysUntilMaturity = Math.ceil(
        (maturityDate.getTime() - utcNowDateInMsec) / 86400000
      );
      return (
        (!tokenOut ||
          tokenOut.toLocaleLowerCase() ===
            market.underlyingAssetSymbol.toLocaleLowerCase()) &&
        (!maturityDays ||
          (maturityDays === "<=30" && daysUntilMaturity <= 30) ||
          (maturityDays === "30-90" &&
            daysUntilMaturity > 30 &&
            daysUntilMaturity <= 90) ||
          (maturityDays === ">90" && daysUntilMaturity > 90)) &&
        (!tokenClass || tokenClass === market.underlyingType)
      );
    });
  }

  private getPendleMarketSupportedTokensCacheKey = (
    chainId: number,
    marketAddress: `0x${string}`
  ) => `pendle-market-supported-tokens:${chainId}:${marketAddress}`;

  getPendleMarketSupportedTokens = createTimedCache(
    this,
    86400000,
    getPendleMarketSupportedTokens,
    this.getPendleMarketSupportedTokensCacheKey
  );

  collectPendleMarketPtAndLpTokens = async (
    chainId: number,
    pendleMarkets: PendleMarket[]
  ) => {
    const marketAddresses = new Map(
      pendleMarkets.map((m) => [
        m.pendleMarketAddress.toLowerCase() as `0x${string}`,
        m,
      ])
    );

    const cached =
      new Set(
        await this.runtime.getCache<`0x${string}`[]>(
          `pendle-markets-collected-pts-and-lps:${chainId}`
        )
      ) ?? new Set<`0x${string}`>();

    const missingPendleMarkets = Array.from(marketAddresses.keys()).filter(
      (address) => !cached.has(address)
    );

    if (missingPendleMarkets.length === 0) {
      return;
    }

    const ptTokens = await getPendleMarketPtTokens(
      chainId,
      missingPendleMarkets
    );

    const lpTokensData = await getTokensData(chainId, missingPendleMarkets);
    const ptTokensData = await getTokensData(
      chainId,
      Array.from(ptTokens.values()).map(
        (t) => t?.toLowerCase() as `0x${string}`
      )
    );

    const tokensToUpsert = [];

    for (const [index, address] of missingPendleMarkets.entries()) {
      if (cached.has(address)) {
        continue;
      }

      const ptToken = ptTokens.get(address);
      const lpTokenData = lpTokensData[index];
      const ptTokenData = ptTokensData[index];

      if (!ptToken || !lpTokenData || !ptTokenData) {
        continue;
      }

      lpTokenData.symbol = `LP${ptTokenData.symbol.substring(2)}`;

      tokensToUpsert.push(ptTokenData!);
      tokensToUpsert.push(lpTokenData!);

      cached.add(address);
    }

    await upsertTokens(
      this.runtime,
      tokensToUpsert.map((t) => ({
        ...(t as Required<TokenData>),
        chainId,
      }))
    );

    await this.runtime.setCache(
      `pendle-markets-collected-pts-and-lps:${chainId}`,
      Array.from(cached)
    );
  };

  // -- End of Pendle Strategies --

  async createCalldata(
    calls: CalldataWithDescription[]
  ): Promise<`0x${string}`> {
    const hash = await sha256(toHex(JSON.stringify(calls)));

    if (!(await this.runtime.setCache(`calldata:${hash}`, calls))) {
      throw new Error("Failed to save calldata in cache");
    }

    return hash;
  }

  async getCalldata(hash: `0x${string}`): Promise<CalldataWithDescription[]> {
    const cached = await this.runtime.getCache<CalldataWithDescription[]>(
      `calldata:${hash}`
    );

    if (!cached) {
      throw new Error("Calldata not found in cache");
    }

    return cached;
  }

  private getPoolConstantsCacheKey = (
    chainId: number,
    address: `0x${string}`
  ) => `pool-constants:${chainId}:${address}`;

  getPoolConstants = createPermanentCache(
    this,
    getPoolConstants,
    this.getPoolConstantsCacheKey
  );

  private getPoolVariablesCacheKey = (
    chainId: number,
    address: `0x${string}`
  ) => `pool-variables:${chainId}:${address}`;

  invalidatePoolVariablesCache = (chainId: number, address: `0x${string}`) =>
    this.runtime.deleteCache(this.getPoolVariablesCacheKey(chainId, address));

  getPoolVariables = createTimedCache(
    this,
    300000,
    getPoolVariablesImpl,
    this.getPoolVariablesCacheKey
  );

  private getVaultConstantsCacheKey = (
    chainId: number,
    address: `0x${string}`
  ) => `vault-constants:${chainId}:${address}`;

  getVaultConstants = createPermanentCache(
    this,
    getVaultConstants,
    this.getVaultConstantsCacheKey
  );

  // getStrategies moved to StrategyComponent
  // handlePoolStrategy moved to StrategyComponent

  async checkEligibility(
    entity?: Entity | null
  ): Promise<{ result: boolean; reason?: Content }> {
    if (!entity) {
      const content: Content = {
        type: "text",
        text: "No entity found",
      };

      return { result: false, reason: content };
    }

    const address = (
      entity.metadata?.eth as { address: `0x${string}` } | undefined
    )?.address;

    if (!address) {
      const content: Content = {
        type: "text",
        text: "No address found",
      };

      return { result: false, reason: content };
    }

    // fixme use cache+invalidate?
    // fixme access metadata's chainid
    const chains = [1, 8453, 42161];
    for (const chainId of chains) {
      const balanceDataEntries = await this.wallet.getBalances(
        address,
        chainId,
        [{ address: ETH_NULL_ADDR, decimals: 18 }]
      );

      const balance =
        balanceDataEntries.length > 0 ? balanceDataEntries[0] : undefined;

      if ((balance?.amount ?? 0n) > 0n) {
        return { result: true };
      }
    }

    const content: Content = {
      type: "text",
      text: `No balance found, please top up your ETH balance. [View on Etherscan](https://etherscan.io/address/${address})`,
    };

    return { result: false, reason: content };
  }

  /**
   * Encode requestRedeem transaction data for vault withdrawals
   */
  encodeRequestRedeem(shares: bigint): `0x${string}` {
    return encodeFunctionData({
      abi: vaultAbi,
      functionName: "requestRedeem",
      args: [shares],
    });
  }

  /**
   * Encode claimWithdrawal transaction data for withdrawal NFT
   */
  encodeClaimWithdrawal(
    requestId: number,
    receiver: `0x${string}`
  ): `0x${string}` {
    return encodeFunctionData({
      abi: withdrawalNftAbi,
      functionName: "claimWithdrawal",
      args: [BigInt(requestId), receiver],
    });
  }
}
