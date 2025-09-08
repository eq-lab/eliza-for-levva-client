export interface SwapEstimation {
  amountOut: string;
  amountOutUsd?: string;
  gas: string;
  gasPrice: string;
  gasUsd?: string;
  decimals: number;
  symbol: string;
}

type PendleSwapParams = {
  type: "pendle";
  market: `0x${string}`;
  slippage?: number;
};

type KyberswapSwapParams = {
  type: "kyber";
  slippage?: number;
};

export type SwapInfo = PendleSwapParams | KyberswapSwapParams;
