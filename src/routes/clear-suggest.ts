import type { Request, Response } from "express";
import { isHex } from "viem";
import { type IAgentRuntime, type Route, logger } from "@elizaos/core";
import { getLevvaUser } from "../util/db";

async function handler(req: Request, res: Response, runtime: IAgentRuntime) {
  const { address, chainId: _chainId } = req.query;

  try {
    if (!isHex(address)) {
      throw new Error("Invalid address");
    }

    let chainId: number | undefined;

    if (!_chainId) {
      throw new Error("Chain ID is required");
    }

    if (!chainId) {
      throw new Error("Chain ID is required");
    }

    const user = (await getLevvaUser(runtime, { address: address }))[0];
    if (!user) {
      throw new Error("User not found");
    }

    const cacheKey = `suggestions:${user.address}:${chainId}`;
    await runtime.deleteCache(cacheKey);

    res.status(200).json({
      success: true,
      message: `Suggestions cache cleared for address ${address} on chain ${chainId}`,
      data: { cacheKey },
    });

    return;
  } catch (error) {
    logger.error("Error clearing cache:", error);

    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

const clearSuggestRoute: Route = {
  name: "clear-suggest",
  path: "/clear-suggest",
  type: "DELETE",
  handler,
};

export default clearSuggestRoute;
