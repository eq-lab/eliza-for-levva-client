import type { Request, Response } from "express";
import { formatUnits, isHex } from "viem";
import { IAgentRuntime, Route } from "@elizaos/core";
import { LEVVA_SERVICE } from "../constants/enum";
import { LevvaService } from "../services/levva/class";

async function handler(req: Request, res: Response, runtime: IAgentRuntime) {
  const { account, chainId } = req.query;

  const chainIdNumber = chainId ? Number(chainId) : 8453;

  try {
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      throw new Error("Service not found");
    }

    if (!isHex(account)) {
      throw new Error("Invalid account");
    }

    const pendleMarkets =
      (await service.getPendleMarkets(chainIdNumber, false, [
        "Stable",
        "ETH",
        "BTC",
        "Other",
      ])) ?? [];
    await service.collectPendleMarketPtAndLpTokens(
      chainIdNumber,
      pendleMarkets
    );

    const tokens = await service.token.getAvailableTokens({
      chainId: chainIdNumber,
    });
    const pendleTokens = tokens.filter((token) =>
      token.symbol.match(/^(LP-|PT-).+\d{1,2}[A-Z]{3}\d{4}$/i)
    );

    const cacheStore = service.cache.getStore("routes");
    const cacheKey = `pendle-balances:${account}:${chainIdNumber}`;

    const cached = await cacheStore.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const pendleBalances = await service.wallet.getBalances(
      account,
      chainIdNumber,
      pendleTokens.map((token) => ({
        address: token.address as `0x${string}`,
        decimals: token.decimals,
      }))
    );

    const result = pendleBalances
      .filter((balance) => balance.amount > 0n)
      .map((balance) => {
        const token = pendleTokens.find(
          (token) => token.address === balance.token
        );

        return {
          tokenSymbol: token?.symbol,
          tokenAddress: token?.address,
          userTokenBalance: formatUnits(
            balance?.amount ?? 0n,
            token?.decimals ?? 18
          ),
        };
      });

    await cacheStore.set(cacheKey, result, 30_000); // 30 seconds

    res.json(result);
  } catch (error) {
    runtime.logger.error(error);

    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

const pendleBalancesRoute: Route = {
  name: "pendle-balances",
  path: "/pendle-balances",
  type: "GET",
  handler,
};

export default pendleBalancesRoute;
