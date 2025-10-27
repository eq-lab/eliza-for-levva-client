import { type Request, type Response } from "express";
import { Route, IAgentRuntime } from "@elizaos/core";
import { LEVVA_SERVICE } from "../constants/enum";
import type { LevvaService } from "../services/levva/class";

const isError = (error: unknown): error is Error =>
  Boolean(typeof error === "object" && error && "message" in error);

const getErrorCode = (error: unknown) => {
  let code = 500;

  if (isError(error)) {
    if (error.cause && Object.hasOwn(error.cause, "code")) {
      code = (error.cause as { code: number }).code;
    }
  }

  return code;
};

async function handler(req: Request, res: Response, runtime: IAgentRuntime) {
  try {
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );

    if (!service) {
      throw new Error("Service not found");
    }

    const { name } = req.query;

    if (!name) {
      throw new Error("'name' query is required", { cause: { code: 400 } });
    }

    const channel = await service.getChannelByName(name as string);

    res.status(200).json({
      success: true,
      data: channel,
    });
  } catch (error) {
    const code = getErrorCode(error);

    res.status(code).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: isError(error) ? error.message : "Unknown error",
      },
    });
  }
}

const route: Route = {
  name: "chan",
  path: "/chan",
  type: "GET",
  handler,
};

export default route;
