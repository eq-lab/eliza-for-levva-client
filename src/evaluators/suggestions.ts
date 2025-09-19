import { desc, eq } from "drizzle-orm";
import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  ModelType,
  UUID,
  logger,
} from "@elizaos/core";
import { plugin } from "@elizaos/plugin-sql";
import { modules } from "../actions/modules";
import { LEVVA_SERVICE } from "../constants/enum";
import { defaultSuggestionPrompt } from "../prompts/default";
import { LevvaService } from "../services/levva/class";
import { suggestTypeTemplate } from "../templates/generate";
import { formatUnits, isHex } from "viem";
import { hasRawMetadata } from "./utils";
import { IntentManager } from "../services/intent-manager";
import { ETH_NULL_ADDR } from "../constants/eth";

const schema = plugin.schema;

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
    let loadingKey: string | undefined;

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

      const user = await service.getUserById(userAddressId as UUID);
      if (!user) {
        return;
      }
      const userAddress = user.address;

      if (!isHex(userAddress)) {
        return;
      }

      // Set loading state
      loadingKey = `suggestions_loading:${user.address}:${chainId}`;
      // @ts-expect-error - stateCache exists on runtime but not in interface
      runtime.stateCache.set(loadingKey, true);

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

      // Check for active intents to provide context-aware suggestions
      const intentManager = runtime.getService<IntentManager>(
        LEVVA_SERVICE.INTENT_MANAGER
      );

      let activeIntent;
      if (intentManager) {
        try {
          // Check for active intents in all domains
          const domains = ["MANAGE_POSITIONS", "SWAP_TOKENS", "ANALYZE_WALLET"];
          for (const domain of domains) {
            const intent = await intentManager.getActiveIntentByDomain(
              userAddressId,
              channelId,
              domain as any
            );
            if (intent && intent.status === "ACTIVE") {
              activeIntent = intent;
              break;
            }
          }
        } catch (error) {
          logger.debug("Error checking for active intents:", error);
        }
      }

      let result: { suggestions: Suggestions[] } | undefined;

      // If there's an active intent, generate context-aware suggestions
      if (activeIntent) {
        logger.info("Generating intent-aware suggestions", {
          intentType: activeIntent.type,
          domain: activeIntent.domain,
          returnData: activeIntent.returnData,
        });

        result = await generateIntentAwareSuggestions(
          runtime,
          activeIntent,
          conversation
        );
      }

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

      // Clear loading state
      // @ts-expect-error - stateCache exists on runtime but not in interface
      runtime.stateCache.delete(loadingKey);
    } catch (error) {
      logger.error("Error in suggestions evaluator:", error);

      // Clear loading state on error too
      if (loadingKey) {
        // @ts-expect-error - stateCache exists on runtime but not in interface
        runtime.stateCache.delete(loadingKey);
      }
    }
  },
};

async function generateIntentAwareSuggestions(
  runtime: IAgentRuntime,
  activeIntent: any,
  conversation: string
): Promise<{ suggestions: Suggestions[] } | undefined> {
  try {
    const { type, returnData } = activeIntent;

    // Get user data for portfolio-based suggestions
    const service = runtime.getService<LevvaService>(
      LEVVA_SERVICE.LEVVA_COMMON
    );
    if (!service) return undefined;

    // Extract user info from conversation or intent context
    let userAddress: `0x${string}` | undefined;
    let chainId: number = 1; // Default to mainnet

    // Try to extract user info from recent messages or intent context
    try {
      // Get recent messages to find user metadata
      const recentMessages = await runtime.getMemories({
        roomId: activeIntent.channelId || "unknown",
        count: 3,
        unique: false,
        tableName: "messages",
      });

      for (const msg of recentMessages) {
        const metadata = (msg as any)?.metadata?.raw?.metadata;
        if (metadata?.userAddressId && metadata?.chainId) {
          const user = await service.getUserById(metadata.userAddressId);
          if (user?.address) {
            userAddress = user.address as `0x${string}`;
            chainId = metadata.chainId;
            break;
          }
        }
      }
    } catch (error) {
      logger.debug("Could not extract user info for suggestions:", error);
    }

    // Generate context-aware suggestions based on intent type and current state
    let contextPrompt = "";

    if (type === "DEPOSIT") {
      const { strategyName, strategyRisk, tokenSymbol, amount } = returnData || {};

      if ((strategyName || strategyRisk) && !amount) {
        // User selected strategy, now needs amount - get their portfolio for realistic suggestions
        const strategy = strategyName || `${strategyRisk} strategy`;

        let portfolioContext = "";
        if (userAddress) {
          try {
            const assets = await service.getWalletAssets({
              address: userAddress,
              chainId,
            });

            // Get available tokens for symbol lookup
            const availableTokens = await service.getAvailableTokens({ chainId });
            const tokenMap = new Map(
              availableTokens.map((token) => [
                token.address ?? ETH_NULL_ADDR,
                token,
              ])
            );

            // Filter assets with meaningful balances and format them
            const significantAssets = assets
              .filter((asset) => asset.amount > 0n)
              .map((asset) => {
                const tokenAddress = asset.token ?? ETH_NULL_ADDR;
                const tokenInfo = tokenMap.get(tokenAddress);
                const decimals = tokenInfo?.decimals ?? 18;
                const symbol = tokenInfo?.symbol ?? "ETH";
                const balance = formatUnits(asset.amount, decimals);
                return { symbol, balance: parseFloat(balance) };
              })
              .filter((asset) => asset.balance > 0.001) // Filter out dust
              .sort((a, b) => b.balance - a.balance) // Sort by balance descending
              .slice(0, 3); // Top 3 assets

            if (significantAssets.length > 0) {
              portfolioContext = `
User's portfolio (top assets):
${significantAssets
  .map((asset) => `- ${asset.symbol}: ${asset.balance.toFixed(6)}`)
  .join("\n")}
`;
            }
          } catch (error) {
            logger.debug("Could not fetch user portfolio:", error);
          }
        }

        contextPrompt = `
The user has selected "${strategy}" and the agent is asking for deposit amount.
${portfolioContext}
Generate 5 realistic suggestions based on user's actual portfolio:

1. Full deposit of their largest holding
2. Partial deposit (50%) of their largest holding  
3. Smaller deposit (25%) of their largest holding
4. Swap suggestion if they don't have the right token
5. General portfolio management option

Examples format:
- "I want to deposit 50 USDC into ${strategy}" (if they have 50 USDC)
- "Let me deposit 25 USDC" (50% of their balance)
- "I'd like to invest 10 USDC" (25% of their balance)
- "Swap ETH -> USDC" (if they need different token)
- "Manage Positions" (general portfolio option)

Use their ACTUAL token balances from portfolio context. Make amounts realistic and actionable.
`;
      } else if (tokenSymbol && !amount && !strategyName && !strategyRisk) {
        // User selected token but no strategy, now needs amount
        contextPrompt = `
The user has selected "${tokenSymbol}" token and the agent is asking for deposit amount.
Generate amount-based suggestions for ${tokenSymbol}:
- "I want to deposit 100 ${tokenSymbol}"
- "Let me deposit 500 ${tokenSymbol}"
- "I'd like to invest 1000 ${tokenSymbol}"
- "Deposit 50% of my ${tokenSymbol}"
- "I want to deposit all my ${tokenSymbol}"
`;
      }
    } else if (type === "SWAP") {
      const { fromToken, toToken, amount, tokenIn, tokenOut } = returnData || {};

      if (fromToken && toToken && amount) {
        // User has complete swap parameters but transaction might have failed - suggest retry options
        contextPrompt = `
The user wants to swap ${amount} ${fromToken} for ${toToken} but the transaction may have failed or needs retry.
Generate retry and alternative suggestions:
- "Please retry the swap"
- "Try swapping ${amount} ${fromToken} to ${toToken} again"
- "Let me retry this transaction"
- "Proceed with the ${amount} ${fromToken} swap"
- "Cancel and try a different amount"
`;
      } else if (fromToken && toToken && !amount) {
        // User selected tokens, now needs amount
        contextPrompt = `
The user wants to swap ${fromToken} for ${toToken} and the agent is asking for swap amount.
Generate amount-based suggestions:
- "I want to swap 100 ${fromToken}"
- "Let me swap 0.1 ${fromToken}"
- "I'd like to swap 500 ${fromToken}"
- "Swap 25% of my ${fromToken}"
- "I want to swap all my ${fromToken}"
`;
      } else if (fromToken && !toToken) {
        // User selected from token, needs to token
        contextPrompt = `
The user wants to swap ${fromToken} and the agent is asking for destination token.
Generate token pair suggestions:
- "Swap ${fromToken} to USDC"
- "Convert ${fromToken} to ETH"
- "Exchange ${fromToken} for WETH"
- "Trade ${fromToken} for DAI"
- "Swap ${fromToken} to USDT"
`;
      } else if (!fromToken && toToken) {
        // User selected to token, needs from token
        contextPrompt = `
The user wants to swap to ${toToken} and the agent is asking for source token.
Generate token pair suggestions:
- "Swap ETH to ${toToken}"
- "Convert USDC to ${toToken}"
- "Exchange WETH for ${toToken}"
- "Trade DAI for ${toToken}"
- "Swap USDT to ${toToken}"
`;
      } else {
        // No tokens specified, suggest popular pairs
        contextPrompt = `
The user wants to swap tokens but hasn't specified which ones.
Generate popular token pair suggestions:
- "Swap ETH to USDC"
- "Convert WETH to DAI"
- "Exchange USDC for ETH"
- "Trade ETH for WETH"
- "Swap DAI to USDC"
`;
      }
    } else if (type === "SEND") {
      const { tokenSymbol, recipientAddress, amount } = returnData || {};

      if (tokenSymbol && recipientAddress && !amount) {
        // User selected token and recipient, now needs amount
        contextPrompt = `
The user wants to send ${tokenSymbol} and the agent is asking for send amount.
Generate amount-based suggestions:
- "I want to send 50 ${tokenSymbol}"
- "Let me send 100 ${tokenSymbol}"
- "I'd like to send 25 ${tokenSymbol}"
- "Send 10% of my ${tokenSymbol}"
- "I want to send all my ${tokenSymbol}"
`;
      }
    }

    if (contextPrompt) {
      const result = await runtime.useModel(ModelType.OBJECT_SMALL, {
        prompt: `${contextPrompt}

<conversation>
${conversation}
</conversation>

Generate 5 contextually relevant suggestions based on the current conversation state.

<output>
Respond using JSON format like this:
{
  "suggestions": [
    {
      "label": "short description",
      "text": "full user message"
    }
  ]
}
</output>`,
      });

      return result;
    }

    return undefined;
  } catch (error) {
    logger.error("Error generating intent-aware suggestions:", error);
    return undefined;
  }
}
