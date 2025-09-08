import z from "zod";
import { ETH_ADDRESS } from "./constants";
export const AggregatorDomain = `https://aggregator-api.kyberswap.com`;

const KyberGetSwapRouteV1ResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z
    .object({
      routeSummary: z.object({
        tokenIn: z.string(),
        amountIn: z.string(),
        amountInUsd: z.string(),
        tokenOut: z.string(),
        amountOut: z.string(),
        amountOutUsd: z.string(),
        gas: z.string(),
        gasPrice: z.string(),
        gasUsd: z.string(),
        l1FeeUsd: z.string().optional(),
        extraFee: z.any(),
        route: z.any(),
        routeID: z.string().optional(),
        checksum: z.string(),
        timestamp: z.number(),
      }),
      routerAddress: z.string(),
    })
    .optional(),
  requestId: z.string(),
});

export type RouteSummary = z.infer<
  typeof KyberGetSwapRouteV1ResponseSchema
>["data"]["routeSummary"];

const KyberPostSwapRouteV1ResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z
    .object({
      data: z.string(),
      routerAddress: z.string(),
      transactionValue: z.string().optional(),
    })
    .optional(),
  requestId: z.string(),
});

export enum ChainName {
  MAINNET = `ethereum`,
  BSC = `bsc`,
  ARBITRUM = `arbitrum`,
  MATIC = `polygon`,
  OPTIMISM = `optimism`,
  AVAX = `avalanche`,
  BASE = `base`,
  CRONOS = `cronos`,
  ZKSYNC = `zksync`,
  FANTOM = `fantom`,
  LINEA = `linea`,
  POLYGONZKEVM = `polygon-zkevm`,
  AURORA = `aurora`,
  BTTC = `bittorrent`,
  SCROLL = `scroll`,
}

export const CHAIN_ID_MAP: Record<`${number}`, ChainName> = {
  "1": ChainName.MAINNET,
  "8453": ChainName.BASE,
  "42161": ChainName.ARBITRUM,
};

export async function getSwapRouteV1({
  tokenIn = ETH_ADDRESS,
  tokenOut = ETH_ADDRESS,
  amountIn,
  chainId,
  clientId,
}: {
  chainId: number;
  tokenIn?: `0x${string}`;
  tokenOut?: `0x${string}`;
  amountIn: `${number}`;
  clientId: string;
}) {
  const chain = CHAIN_ID_MAP[chainId.toString()];

  if (!chain) {
    throw new Error(`Chain ${chainId} not supported`);
  }

  const path = `/${chain}/api/v1/routes`;

  const params: {
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    amountIn: `${number}`;
    chain?: ChainName;
  } = {
    tokenIn,
    tokenOut,
    amountIn,
  };

  const response = await fetch(
    `${AggregatorDomain}${path}?${new URLSearchParams(params).toString()}`,
    {
      headers: {
        "x-client-id": clientId,
      },
    }
  );

  const json = await response.json();
  const parsed = KyberGetSwapRouteV1ResponseSchema.safeParse(json);

  if (!parsed.success) {
    console.error(parsed.error);
    return;
  }

  return parsed.data;
}

export async function postSwapRouteV1({
  address,
  route,
  clientId,
  chainId,
}: {
  address: `0x${string}`;
  route?: Awaited<ReturnType<typeof getSwapRouteV1>>;
  clientId?: string;
  chainId: number;
}) {
  const chain = CHAIN_ID_MAP[chainId.toString()];

  if (!chain) {
    throw new Error(`Chain ${chainId} not supported`);
  }

  const path = `/${chain}/api/v1/route/build`;
  const routeSummary = route?.data?.routeSummary;

  if (!routeSummary) {
    console.error("No swap route data", route);
    return;
  }

  // Configure the request body (refer to Docs for the full list)
  const requestBody = {
    routeSummary: routeSummary,
    sender: address,
    recipient: address,
    slippageTolerance: 10, //0.1%
  };

  const response = await fetch(`${AggregatorDomain}${path}`, {
    method: "POST",
    headers: {
      "x-client-id": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const json = await response.json();
  const parsed = KyberPostSwapRouteV1ResponseSchema.safeParse(json);

  if (!parsed.success) {
    console.error(parsed.error);
    return;
  }

  return parsed.data;
}
