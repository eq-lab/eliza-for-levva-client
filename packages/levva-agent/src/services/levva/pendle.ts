import { PoolConstants } from "./pool";
import pendleAdapterAbi from "./abi/pendle.adapter.abi";
import { getChain, getClient } from "../../util/eth";
import { ETH_NULL_ADDR } from "../../constants/eth";

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
