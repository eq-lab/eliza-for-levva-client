import { IAgentRuntime } from "@elizaos/core";
import { isHex } from "viem";
import {
  extractTokenData,
  getChain,
  getTokenData,
  getToken as getTokenImpl,
  parseTokenInfo,
  TokenEntry,
  upsertToken,
} from "../../util";
import { TokenData, TokenDataWithInfo } from "../../types/token";
import { ETH_NULL_ADDR } from "../../constants/eth";
import { getToken } from "../../api/levva";
import { createTimedCache } from "./cache-util";

export class TokenServiceComponent {
  runtime: IAgentRuntime;

  private tokenMap = new Map<
    `${number}:0x${string}`,
    Omit<TokenEntry, "id"> | undefined
  >();

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  cleanup() {
    // Cleanup token map if needed
    this.tokenMap.clear();
  }

  /** @deprecated fix typing, maybe consider making private */
  getToken = (params: Parameters<typeof getTokenImpl>[1]) =>
    getTokenImpl(this.runtime, params);

  getTokenDataWithInfo = async ({
    chainId,
    symbolOrAddress,
  }: {
    chainId: number;
    symbolOrAddress?: string;
  }) => {
    const chain = getChain(chainId);
    let tokenData: TokenDataWithInfo | undefined;

    if (!isHex(symbolOrAddress)) {
      const symbol = symbolOrAddress;

      if (symbol?.toLowerCase() === chain.nativeCurrency.symbol.toLowerCase()) {
        this.runtime.logger.info("Using native currency as token value");
        tokenData = extractTokenData(chain.nativeCurrency);
      } else {
        const token = (await this.getToken({ chainId: chain.id, symbol }))[0];

        if (!token) {
          return;
        }

        tokenData = extractTokenData(token);
        /* @ts-expect-error fix typing */
        tokenData.info = parseTokenInfo(token.info);
      }
    } else {
      tokenData = await getTokenData(chain.id, symbolOrAddress);
      this.runtime.logger.info(
        `Saving ${symbolOrAddress} as ${tokenData.symbol}`
      );

      // todo now we can get market from adapter contract for base token, can be used
      await upsertToken(this.runtime, {
        ...(tokenData as Required<TokenData>),
        chainId: chain.id,
      });
    }

    return tokenData;
  };

  getWETH = async (chainId: number) => {
    const [weth] = await this.getToken({ chainId, symbol: "WETH" });

    if (!weth) {
      throw new Error(`WETH not found for chain ${chainId}`);
    }

    return weth;
  };

  private populateTokenMap = async (entries: Omit<TokenEntry, "id">[]) => {
    for (const entry of entries) {
      const key =
        `${entry.chainId}:${entry.address}` as `${number}:0x${string}`;

      if (!this.tokenMap.has(key)) {
        this.tokenMap.set(key, entry);
      }
    }
  };

  getTokenFromMap = (params: { chainId: number; address: `0x${string}` }) => {
    const key =
      `${params.chainId}:${params.address}` as `${number}:0x${string}`;

    return this.tokenMap.get(key);
  };

  async getAvailableTokens(params: { chainId: number }) {
    const chain = getChain(params.chainId);

    const tokens: /* fixme type */ Omit<TokenEntry, "id">[] =
      await this.getToken({
        chainId: params.chainId,
      });

    tokens.push({
      symbol: chain.nativeCurrency.symbol,
      name: chain.nativeCurrency.name,
      decimals: chain.nativeCurrency.decimals,
      address: ETH_NULL_ADDR,
      info: undefined,
      chainId: params.chainId,
    });

    this.populateTokenMap(tokens);
    return tokens;
  }

  formatToken(token: {
    symbol: string;
    name: string;
    address?: string;
    decimals: number;
    info?: unknown;
  }) {
    const isNative = !token.address || token.address === ETH_NULL_ADDR;
    return `${token.symbol}(${token.name}) - ${isNative ? "Native token" : `${token.address}`}. Decimals: ${token.decimals}.`;
  }

  private getExternalTokenDataCacheKey = (
    tokenAddress: `0x${string}`,
    chainId: number
  ) => `external-token-data:${chainId}:${tokenAddress}`;

  getExternalTokenData = createTimedCache(
    this,
    900000, // 15 minutes in milliseconds
    async (tokenAddress: `0x${string}`, chainId: number) => {
      const result = await getToken(tokenAddress, chainId);
      return result.success ? result.data : undefined;
    },
    this.getExternalTokenDataCacheKey
  );
}
