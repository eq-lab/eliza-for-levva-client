import type { Request, Response } from "express";
import { isHex } from "viem";
import {
  createUniqueUuid,
  IAgentRuntime,
  IKVStore,
  Route,
} from "@elizaos/core";
import { LEVVA_SERVICE } from "../constants/enum";
import { LevvaService } from "../services/levva/class";
import { ActionResultsCache } from "src/util";

async function handler(req: Request, res: Response, runtime: IAgentRuntime) {
  const { address } = req.query;

  try {
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      throw new Error("Service not found");
    }

    if (!isHex(address)) {
      throw new Error("Invalid address");
    }

    const user = await service.getUser(address);

    if (!user) {
      throw new Error("User not found");
    }

    const entityId = createUniqueUuid(runtime, user.id);

    const [lastMessage] = await runtime.getMemories({
      entityId,
      tableName: "messages",
    });

    let ready = true;
    const messageId = lastMessage?.id;

    if (!messageId) {
      res.json({
        success: true,
        data: {
          ready,
        },
      });

      return;
    }

    const cacheKey = `${messageId}_action_results`;
    const stateCache = (runtime as any).stateCache as IKVStore<
      ActionResultsCache,
      any
    >;

    const actionState = (await stateCache.get(cacheKey))?.data;

    if (!actionState?.actionPlan) {
      res.json({
        success: true,
        data: {
          ready,
          actionState,
        },
      });

      return;
    }

    for (let i = 0; i < actionState.actionPlan.totalSteps; i++) {
      const result = actionState.actionPlan.steps[i];
      // todo check result

      if (result.status !== "completed" && result.status !== "failed") {
        ready = false;
        break;
      }
    }

    res.json({
      success: true,
      data: {
        ready,
        actionPlan: actionState.actionPlan,
        actionResults: actionState.actionResults,
      },
    });
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

const statusRoute: Route = {
  name: "status",
  path: "/status",
  type: "GET",
  handler,
};

export default statusRoute;
