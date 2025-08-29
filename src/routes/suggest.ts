import { desc, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { isHex, sha256, toHex } from "viem";
import {
  type IAgentRuntime,
  type Route,
  logger,
  ModelType,
} from "@elizaos/core";
import { schema } from "@elizaos/plugin-sql";
import { LEVVA_SERVICE } from "../constants/enum";
import { LevvaService } from "../services/levva/class";
import { CacheEntry } from "../types/core";
import { getLevvaUser } from "../util/db";
import { defaultSuggestionPrompt } from "../prompts/default";

interface Suggestions {
  label: string;
  text: string;
}

async function handler(req: Request, res: Response, runtime: IAgentRuntime) {
  const { address, chainId: _chainId, channelId } = req.query;
  const service = runtime.getService<LevvaService>(LEVVA_SERVICE.LEVVA_COMMON);

  try {
    if (!service) {
      throw new Error("Service not found");
    }

    if (!isHex(address)) {
      throw new Error("Invalid address");
    }

    if (!channelId) {
      throw new Error("Channel ID is required");
    }

    const user = (await getLevvaUser(runtime, { address }))[0];

    if (!user) {
      throw new Error("User not found");
    }

    if (!_chainId) {
      throw new Error("Chain ID is required");
    }

    const chainId = Number(_chainId);

    if (!Number.isFinite(chainId)) {
      throw new Error("Invalid chain ID");
    }

    const messages = await service.getMessages({
      where: eq(schema.messageTable.channelId, channelId),
      orderBy: desc(schema.messageTable.createdAt),
      limit: 10,
    });

    const needsSuggest = !messages.length || messages[0].authorId !== user.id;

    if (!needsSuggest) {
      res.status(200).json({
        success: true,
        data: {
          suggestions: [],
        },
      });

      return;
    }

    const cached = await runtime.getCache<CacheEntry<Suggestions[]>>(
      `suggestions:${user.address}:${chainId}`
    );

    let suggestions = cached?.value;

    if (!suggestions) {
      const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt: defaultSuggestionPrompt({ conversation: "New conversation" }),
      });
      suggestions = result?.suggestions || [];
    }

    res.status(200).json({
      success: true,
      data: {
        suggestions,
      },
    });
  } catch (error) {
    logger.error(error);

    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

const suggestRoute: Route = {
  name: "suggest",
  path: "/suggest",
  type: "GET",
  handler,
};

export default suggestRoute;
