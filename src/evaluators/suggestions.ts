import { desc, eq } from "drizzle-orm";
import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  ModelType,
  logger,
} from "@elizaos/core";
import { schema } from "@elizaos/plugin-sql";
import { modules } from "../actions/modules";
import { LEVVA_SERVICE } from "../constants/enum";
import { defaultSuggestionPrompt } from "../prompts/default";
import { LevvaService } from "../services/levva/class";
import { suggestTypeTemplate } from "../templates/generate";
import { getLevvaUser } from "../util/db";
import { isHex } from "viem";

interface MessageEntry {
  authorId: string;
  rawMessage: {
    text?: string;
    message?: string;
    actions: string[];
    thought: string;
    metadata: Record<string, any>;
  };
}

interface Suggestions {
  label: string;
  text: string;
}

interface RawMetadata {
  raw?: {
    channelId?: string;
    metadata?: {
      userAddressId?: string;
      chainId?: number;
    };
  };
}

const hasRawMetadata = (metadata: any): metadata is RawMetadata => {
  return metadata && typeof metadata === "object" && "raw" in metadata;
};

const getChainId = (message?: MessageEntry): number | undefined => {
  const value = message?.rawMessage.metadata?.chainId;

  if (typeof value === "number") {
    return value;
  }
};

export const suggestionsEvaluator: Evaluator = {
  name: "SUGGESTIONS_GENERATOR",
  description: "Generate suggestions asynchronously after action completion",
  alwaysRun: false,
  similes: [
    "GENERATE_SUGGESTIONS",
    "CREATE_SUGGESTIONS",
    "SUGGESTION_GENERATOR",
    "suggestions generator",
    "generate suggestions",
  ],
  examples: [],

  validate: async () => {
    return true;
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    try {
      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        return;
      }

      if (!hasRawMetadata(message.metadata)) {
        return;
      }

      const raw = message.metadata.raw;
      const metadata = raw?.metadata;
      const channelId = raw?.channelId;
      const userAddressId = metadata?.userAddressId;
      const chainId = metadata?.chainId;

      if (!channelId || !userAddressId || !chainId) {
        return;
      }

      const user = (
        await getLevvaUser(runtime, {
          id: userAddressId as `${string}-${string}-${string}-${string}-${string}`,
        })
      )[0];

      if (!user) {
        return;
      }
      const userAddress = user.address;

      if (!isHex(userAddress)) {
        return;
      }

      const messages = await service.getMessages({
        where: eq(schema.messageTable.channelId, channelId),
        orderBy: desc(schema.messageTable.createdAt),
        limit: 10,
      });

      const recentMessages: (MessageEntry["rawMessage"] & {
        isAgent: boolean;
      })[] = [];

      let actionLookup: string | undefined;

      for (let i = 0; i < messages.length; i++) {
        const messageItem = messages[i];
        const isAgent = messageItem.authorId !== user.id;

        if (!actionLookup) {
          actionLookup = messageItem.rawMessage?.actions?.[0];
        }

        const messageChainId = isAgent
          ? getChainId(messages[i + 1])
          : getChainId(messageItem);

        if (messageChainId && messageChainId !== chainId) {
          continue;
        }

        const rawMessage = messageItem.rawMessage;
        recentMessages.push({ ...rawMessage, isAgent });
      }

      const suggestions = modules.find(
        (m) => m.action.name === actionLookup
      )?.suggest;

      const conversation = recentMessages
        .map((item) => {
          return `${item.isAgent ? "Agent: " : "User: "} ${item.text ?? item.message}`;
        })
        .reverse()
        .join("\n");

      let result: { suggestions: Suggestions[] } | undefined;

      if (suggestions?.length) {
        const gen = await runtime.useModel(ModelType.OBJECT_LARGE, {
          prompt: suggestTypeTemplate(
            suggestions.map(({ name, description }) => ({
              name,
              description,
            }))
          )
            .replace("{{userData}}", JSON.stringify(user))
            .replace("{{conversation}}", conversation),
        });

        const type = gen.type;
        const suggest = suggestions?.find((s) => s.name === type);

        if (suggest) {
          const model = suggest.model ?? ModelType.OBJECT_SMALL;

          const prompt = await suggest.getPrompt(runtime, {
            address: userAddress,
            chainId,
            conversation,
            decision: gen,
          });

          result = await runtime.useModel(model, {
            prompt,
          });
        }
      }

      if (!result) {
        result = await runtime.useModel(ModelType.OBJECT_SMALL, {
          prompt: defaultSuggestionPrompt({ conversation }),
        });
      }

      await runtime.setCache(`suggestions:${user.address}:${chainId}`, {
        value: result?.suggestions ?? [],
      });
    } catch (error) {
      logger.error("Error in suggestions evaluator:", error);
    }
  },
};
