import { PoolConstants } from "./pool";
import pendleAdapterAbi from "./abi/pendle.adapter.abi";
import { getChain, getClient } from "../../util/eth";
import { ETH_NULL_ADDR } from "../../constants/eth";
import pendleMarketAbi from "./abi/pendle.market.abi";
import { PendleMarket } from "../../api/levva/schema";

const ADAPTERS = new Map<number, `0x${string}`>([
  [42161, "0x03fA449776FBE2a38771BD638be94E32592372f6"],
]);

export const getPendleParams = async (
  chainId: number,
  params: Pick<PoolConstants, "baseToken" | "quoteToken">
): Promise<
  | {
      market: `0x${string}`;
      slippage: number;
    }
  | undefined
> => {
  const adapter = ADAPTERS.get(chainId);

  if (!adapter) {
    throw new Error(`Adapter not found for chainId ${chainId}`);
  }

  const chain = getChain(chainId);
  const client = getClient(chain);

  const [market, slippage] = await client.readContract({
    abi: pendleAdapterAbi,
    address: adapter,
    functionName: "getPoolData",
    args: [params.baseToken, params.quoteToken],
  });

  if (market === ETH_NULL_ADDR) {
    return;
  }

  return {
    market,
    slippage,
  };
};

export const getPendleMarketPtTokens = async (
  chainId: number,
  marketAddresses: `0x${string}`[]
): Promise<Map<`0x${string}`, `0x${string}` | undefined>> => {
  const chain = getChain(chainId);
  const client = getClient(chain);

  const tokens = await client.multicall({
    batchSize: 100,
    contracts: marketAddresses.map((market) => ({
      abi: pendleMarketAbi,
      address: market,
      functionName: "readTokens",
    })),
  });

  const ptTokens = tokens.map((result) =>
    result.status === "success"
      ? (
          result.result as readonly [
            `0x${string}`,
            `0x${string}`,
            `0x${string}`,
          ]
        )[1]
      : undefined
  );

  return new Map(
    ptTokens.map((token, index) => [marketAddresses[index], token])
  );
};

export const toPendleSymbol = (
  market: PendleMarket
): { lp: string; pt: string; symbol: string } => {
  const date = new Date(market.maturityDate);

  const day = date.getUTCDate();

  const monthNames = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const month = monthNames[date.getUTCMonth()];

  const year = date.getUTCFullYear();

  return {
    lp: `LP-${market.underlyingAssetSymbol}-${day}${month}${year}`,
    pt: `PT-${market.underlyingAssetSymbol}-${day}${month}${year}`,
    symbol: `${market.underlyingAssetSymbol}-${day}${month}${year}`,
  };
};

export const toPendleDetails = (
  ptOrLpSymbol: string
): { maturityDate: string; underlyingAssetSymbol: string } => {
  const match = ptOrLpSymbol.match(/(\d{2})([A-Z]{3})(\d{4})$/i)!;

  const day = match[1];
  const monthStr = match[2].toUpperCase();
  const year = match[3];

  const months: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };

  const month = months[monthStr];

  const underlyingAssetSymbol = ptOrLpSymbol
    .replace(/^(LP-|PT-)/i, "")
    .replace(/-\d{2}[A-Z]{3}\d{4}$/i, "");

  return {
    maturityDate: `${year}-${month}-${day}T00:00:00Z`,
    underlyingAssetSymbol,
  };
};
