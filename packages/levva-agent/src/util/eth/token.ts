import { erc20Abi, getAddress, isHex } from "viem";
import type { TokenData, TokenInfo } from "../../types/token";
import { getChain, getClient } from "./client";
import { ETH_NULL_ADDR } from "src/constants/eth";

export const getBalanceOf = async (
  chainId: number,
  account: `0x${string}`,
  tokens: `0x${string}`[]
) => {
  const chain = getChain(chainId);
  const client = getClient(chain);

  const erc20Tokens = tokens.filter((token) => token !== ETH_NULL_ADDR);
  let balances: { token: `0x${string}`; balance: bigint }[] = [];

  if (erc20Tokens.length > 0) {
    const erc20Balances = await client.multicall({
      contracts: erc20Tokens.map((token) => ({
        abi: erc20Abi,
        address: token,
        functionName: "balanceOf",
        args: [account],
      })),
    });

    balances = erc20Tokens.map((token, index) => ({
      token: token,
      balance:
        erc20Balances[index].status === "success"
          ? (erc20Balances[index].result as bigint)
          : BigInt(0),
    }));
  }

  const nativeToken = tokens.find((token) => token === ETH_NULL_ADDR);

  if (nativeToken) {
    const nativeBalance = await client.getBalance({ address: account });

    balances.push({
      token: nativeToken!,
      balance: nativeBalance,
    });
  }

  return balances;
};

export const getTokenData = async (
  chainId?: number,
  address?: `0x${string}`
): Promise<TokenData> => {
  const chain = getChain(chainId);

  if (!address || address === ETH_NULL_ADDR) {
    const { name, symbol, decimals } = chain.nativeCurrency;
    return { name, symbol, decimals };
  }

  const client = getClient(chain);

  const [name, symbol, decimals] = await Promise.all([
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "name",
    }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);

  return { address: getAddress(address), name, symbol, decimals };
};

export const getTokensData = async (
  chainId: number,
  tokens: (`0x${string}` | undefined)[]
): Promise<(TokenData | undefined)[]> => {
  const chain = getChain(chainId);
  const client = getClient(chain);

  const data = await client.multicall({
    contracts: tokens
      .filter((token) => token && token !== ETH_NULL_ADDR)
      .map((token) => token!)
      .flatMap((token) => [
        {
          abi: erc20Abi,
          address: token,
          functionName: "name",
        },
        {
          abi: erc20Abi,
          address: token,
          functionName: "symbol",
        },
        {
          abi: erc20Abi,
          address: token,
          functionName: "decimals",
        },
      ]),
  });

  const result: (TokenData | undefined)[] = [];

  for (const [index, token] of tokens.entries()) {
    if (!token) {
      result.push(undefined);
      continue;
    }

    if (token === ETH_NULL_ADDR) {
      const { name, symbol, decimals } = chain.nativeCurrency;
      result.push({ name, symbol, decimals });
      continue;
    }

    const name =
      data[index * 3].status === "success"
        ? (data[index * 3].result as string)
        : undefined;
    const symbol =
      data[index * 3 + 1].status === "success"
        ? (data[index * 3 + 1].result as string)
        : undefined;
    const decimals =
      data[index * 3 + 2].status === "success"
        ? (data[index * 3 + 2].result as number)
        : undefined;

    if (name && symbol && decimals) {
      result.push({ address: getAddress(token), name, symbol, decimals });
    } else {
      result.push(undefined);
    }
  }

  return result;
};

export const extractTokenData = (
  obj?: Record<string, unknown>
): TokenData | undefined => {
  const { address, decimals, symbol, name } = obj ?? {};

  if (address && !isHex(address)) {
    return;
  }

  if (typeof symbol !== "string") {
    return;
  }

  if (typeof name !== "string") {
    return;
  }

  if (typeof decimals !== "number") {
    return;
  }

  return {
    address: address as `0x${string}`,
    decimals,
    symbol,
    name,
  };
};

export const parseTokenInfo = (info?: unknown): TokenInfo => {
  const tokenInfo: TokenInfo = {};

  if (!info || typeof info !== "object") {
    return tokenInfo;
  }

  // fixme validate with zod
  if ("swap" in info) {
    const swap: TokenInfo["swap"] = info.swap as any;
    tokenInfo.swap = swap;
  }

  if ("allowanceSlot" in info && isHex(info.allowanceSlot)) {
    tokenInfo.allowanceSlot = info.allowanceSlot;
  }

  return tokenInfo;
};
