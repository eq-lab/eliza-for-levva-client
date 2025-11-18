export interface SwapEstimation {
  amountOut: string;
  amountOutUsd?: string;
  gas: string;
  gasPrice: string;
  gasUsd?: string;
  decimals: number;
  symbol: string;
}

type KyberswapSwapParams = {
  type: "kyber";
  slippage?: number;
};

export type SwapInfo = KyberswapSwapParams;
