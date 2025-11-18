import { Chain, formatUnits, isHex } from "viem";
import { estimationTemplate } from "../../templates";
import type { SwapEstimation, SwapInfo } from "../../types/swap";
import { TokenDataWithInfo } from "src/types/token";
import { IAgentRuntime } from "@elizaos/core";
import { CalldataWithDescription } from "src/types/tx";
import { getClient } from "./client";
import { getSwapRouteV1, postSwapRouteV1 } from "src/api/swap/kyber";
import { getAllowance } from "./allowance";

export const formatEstimation = (estimation: SwapEstimation) => {
  const usd = Boolean(estimation.amountOutUsd && estimation.gasUsd);

  const hasFailedGasEstimation = [estimation.gas, estimation.gasPrice].some(
    (v) => !v || v === "failed"
  );

  const gas = hasFailedGasEstimation
    ? "failed to estimate gas"
    : formatUnits(
        BigInt(estimation.gas ?? "0") * BigInt(estimation.gasPrice ?? "0"),
        18
      );

  const amountOut = formatUnits(
    BigInt(estimation.amountOut ?? "0"),
    estimation.decimals
  );

  return estimationTemplate(usd)
    .replace("{{amountOut}}", amountOut)
    .replace("{{symbol}}", estimation.symbol)
    .replace("{{amountOutUsd}}", estimation.amountOutUsd ?? "")
    .replace("{{gas}}", gas)
    .replace("{{gasUsd}}", estimation.gasUsd ?? "");
};

interface SwapParams {
  address: `0x${string}`;
  chain: Chain;
  amountIn: bigint;
  decimals: number;
}

export function selectSwapRouter(
  tokenIn: TokenDataWithInfo,
  tokenOut: TokenDataWithInfo
) {
  // by default use kyber
  let router: SwapInfo = { type: "kyber" };

  if (router.type === "kyber") {
    return async (
      runtime: IAgentRuntime,
      { address, amountIn, chain, decimals }: SwapParams
    ) => {
      const client = getClient(chain);
      const calls: CalldataWithDescription[] = [];
      const clientId = runtime.getSetting("KYBER_CLIENT_ID");
      const amount = formatUnits(amountIn, decimals);

      const route = await getSwapRouteV1({
        chainId: chain.id,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: amountIn.toString() as `${number}`,
        clientId,
      });

      const routeSummary = route?.data?.routeSummary;
      const routerAddress = route?.data?.routerAddress;

      if (!isHex(routerAddress) || !routeSummary) {
        throw new Error(
          `Failed to get swap route, received: ${JSON.stringify(route)}`
        );
      }

      const build = await postSwapRouteV1({
        address,
        route,
        clientId,
        chainId: chain.id,
      });

      if (!build?.data) {
        throw new Error(
          `Failed to build swap route, received: ${JSON.stringify(build)}`
        );
      }

      if (tokenIn.address) {
        const { approve } = await getAllowance({
          sender: address,
          spender: routerAddress,
          token: tokenIn.address,
          amount: amountIn,
          client,
          decimals: tokenIn.decimals,
          symbol: tokenIn.symbol,
        });

        if (approve) {
          calls.push(approve);
        }
      }

      calls.push({
        to: routerAddress,
        data: build.data.data as `0x${string}`,
        value: build.data.transactionValue,
        title: `Swap ${amount} ${tokenIn.symbol} to ${tokenOut.symbol}`,
        description: `Swap ${amount} ${tokenIn.symbol} to ${tokenOut.symbol} on KyberSwap`,
      });

      const estimation: SwapEstimation = {
        decimals: tokenOut.decimals,
        symbol: tokenOut.symbol,
        amountOut: routeSummary.amountOut,
        gas: routeSummary.gas,
        gasPrice: routeSummary.gasPrice,
        amountOutUsd: routeSummary.amountOutUsd,
        gasUsd: routeSummary.gasUsd,
      };

      return { calls, estimation };
    };
  }

  throw new Error(`Unknown swap router: ${router.type}`);
}
