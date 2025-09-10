import { parseUnits } from "viem";
import { type Action, type Content } from "@elizaos/core";
import { LEVVA_ACTIONS, LEVVA_SERVICE } from "../constants/enum";
import { LEVVA_PROVIDER_NAME, LevvaProviderState } from "../providers";
import {
  SWAP_PARAMS_PROVIDER_NAME,
  SwapParamsProviderData,
} from "../providers/swap-params";
import { selectProviderState } from "../providers/util";
import { LevvaService } from "../services/levva/class";
import { CalldataWithDescription } from "../types/tx";
import { getChain } from "../util";
import { rephrase } from "../util/generate";
import { formatEstimation, selectSwapRouter } from "../util/eth/swap";
import { Suggestion } from "./types";
import { unwrapEth, wrapEth } from "src/util/eth/weth";
import { getPreviousReplyContext } from "../util/action-results";
import { exchangeAmountPrompt } from "../prompts/suggest/exchange-amount";
import { exchangePairsPrompt } from "../prompts/suggest/exchange-pairs";

const description =
  "Initiate token swap for user if all parameters are provider and ask user if lacking exchange parameters.";

export const action: Action = {
  name: LEVVA_ACTIONS.SWAP_TOKENS,
  description,
  similes: [
    "SWAP_TOKENS",
    "EXCHANGE_TOKENS",
    "SWAP_ASSETS",
    "EXCHANGE_ASSETS",
    "swap tokens",
    "exchange tokens",
    "swap",
    "exchange",
    "exchange assets",
    "swap assets",
  ],

  validate: async () => {
    // fixme validations run in ACTIONS provider on 1st runtime.composeState call
    // runtime.composeState gets all providers in Promise.all, so provider position does not seem to matter
    // consider implementing composeState sequentially, or calling compose state in validator(seems unreliable)
    // so for now decide to always include
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    // Get previous action context BEFORE try block for error handling
    const prevActions = await getPreviousReplyContext(runtime, message);

    try {
      runtime.logger.info("SWAP_TOKENS action called");

      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service, disable action");
      }

      if (!callback) {
        throw new Error("Callback not found, disable action");
      }

      if (!state) {
        throw new Error("State not found, disable action");
      }

      const lvva = selectProviderState<LevvaProviderState>(
        LEVVA_PROVIDER_NAME,
        state
      );

      if (!lvva?.user) {
        throw new Error("User address ID is required");
      }

      const params = selectProviderState<SwapParamsProviderData>(
        SWAP_PARAMS_PROVIDER_NAME,
        state
      );

      if (!params) {
        throw new Error(
          `Failed to get provider(${SWAP_PARAMS_PROVIDER_NAME}) results`
        );
      }

      if (
        !params.type ||
        !params.tokenIn ||
        !params.tokenOut ||
        !params.amount
      ) {
        if (!state.values.swap) {
          throw new Error("Failed to get swap parameters");
        }

        const content: Content = {
          thought: "Need to ask user for missing parameters",
          text: state.values.swap,
          actions: ["SWAP_TOKENS"],
          source: message.content.source,
        };

        const responseContent = await rephrase({
          runtime,
          content,
          state,
          prevActions,
        });
        await callback(responseContent);

        return {
          text: `Generated text: ${responseContent?.text}`,
          values: {
            success: true,
            responded: true,
            lastReply: responseContent.text,
            lastReplyTime: Date.now(),
            thoughtProcess: responseContent?.thought,
          },
          data: {
            actionName: LEVVA_ACTIONS.SWAP_TOKENS,
            response: responseContent,
            thought: responseContent?.thought,
            initialReply: content.text,
            initialThought: content.thought,
            messageGenerated: true,
          },
          success: true,
        };
      }

      const { tokenIn, tokenOut, amount, type } = params;
      const amountUnits = parseUnits(amount, tokenIn.decimals);
      const chain = getChain(lvva.chainId);
      let calldata: CalldataWithDescription[];
      let thought: string;
      let text: string;

      switch (type) {
        case "kyber": {
          // todo remove selectSwapRouter
          const swap = selectSwapRouter(tokenIn, tokenOut);

          const { calls, estimation } = await swap(runtime, {
            address: lvva.user.address,
            amountIn: amountUnits,
            chain,
            decimals: tokenIn.decimals,
          });

          calldata = calls;
          const description =
            calls.length > 1
              ? `### Transaction steps\n${calls.map((c, i) => `${i + 1}. ${c.description}`).join("\n")}`
              : `${calls[0].description}\n\n${formatEstimation(estimation)}`;
          thought = `Prepared transaction to swap ${amount} ${tokenIn.symbol} to ${tokenOut.symbol}, display confirmation`;
          text = `${description}\n\nPlease approve transactions in your wallet.`;
          break;
        }
        case "wrap": {
          calldata = [
            wrapEth(amountUnits, {
              address: tokenOut.address!,
              decimals: tokenOut.decimals,
            }),
          ];

          thought = `Prepared transaction to wrap ${amount} ${tokenIn.symbol} to ${tokenOut.symbol}, display confirmation`;
          text = `Wrapping ${amount} ${tokenIn.symbol} to ${tokenOut.symbol}\n\nPlease approve transactions in your wallet.`;
          break;
        }
        case "unwrap": {
          calldata = [
            unwrapEth(amountUnits, {
              address: tokenIn.address!,
              decimals: tokenIn.decimals,
            }),
          ];

          thought = `Prepared transaction to unwrap ${amount} ${tokenIn.symbol} to ${tokenOut.symbol}, display confirmation`;
          text = `Unwrapping ${amount} ${tokenIn.symbol} to ${tokenOut.symbol}\n\nPlease approve transactions in your wallet.`;
          break;
        }
        default:
          throw new Error(`Unknown swap type: ${params.type}`);
      }

      const hash = await service.createCalldata(calldata);

      const json = {
        id: "calls.json",
        url: `/api/calldata?hash=${hash}`,
      };

      const content: Content = {
        thought,
        text,
        actions: ["SWAP_TOKENS"],
        source: message.content.source,
        attachments: [json],
      };

      const responseContent = await rephrase({
        runtime,
        content,
        state,
        prevActions,
      });
      await callback(responseContent);

      return {
        text: `Generated calldata accessible at ${json.url}, generated text: ${responseContent?.text}`,
        values: {
          success: true,
          responded: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: LEVVA_ACTIONS.SWAP_TOKENS,
          response: responseContent,
          thought: responseContent?.thought,
          initialReply: content.text,
          initialThought: content.thought,
          messageGenerated: true,
        },
        success: true,
      };
    } catch (error) {
      runtime.logger.error("Error in SWAP_TOKENS action:", error);
      const errorMessage = (error as Error).message ?? "unknown error";
      const thought = `Action failed with error: ${errorMessage}. I should tell the user about the error.`;
      const text = `Failed to swap, reason: ${errorMessage}. Please try again.`;

      const responseContent = await rephrase({
        runtime,
        content: {
          text,
          thought,
          actions: ["SWAP_TOKENS"],
          source: message.content.source,
        },
        state: state!,
        prevActions,
      });

      await callback?.(responseContent);

      return {
        text: `Error generating transaction: ${errorMessage}.`,
        values: {
          success: false,
          responded: true,
          error: true,
          lastReply: responseContent.text,
          lastReplyTime: Date.now(),
          thoughtProcess: responseContent?.thought,
        },
        data: {
          actionName: LEVVA_ACTIONS.SWAP_TOKENS,
          error: errorMessage,
        },
        success: false,
        error: error as Error,
      };
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Please swap {{amount}} {{token1}} to {{token2}}",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Please confirm swap for {{amount}} {{token1}} for {{token2}}",
          action: "SWAP_TOKENS",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Swap tokens",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "What tokens do you want to swap?",
          action: "SWAP_TOKENS",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Token address is {{address}}",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Swapping {{amount}} {{token1}} to {{token2}}...\nPlease approve transactions in your wallet.",
          actions: ["SWAP_TOKENS"],
        },
      },
    ],
  ],
};

export const suggest: Suggestion[] = [
  {
    name: "exchange-amount",
    description:
      "Use if user wants to swap tokens, and the agent knows what token to swap but the amount is not specified, suggest how much to swap based on user's portfolio, eg: known includes 'tokenIn' and 'tokenOut' and unknown includes 'amountIn'",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision }
    ) => {
      const service = runtime.getService<LevvaService>("levva");
      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const assets = await service.getWalletAssets({ address, chainId });
      const available = await service.getAvailableTokens({ chainId });

      return exchangeAmountPrompt({
        conversation,
        decision,
        walletAssetsFormatted: service.formatWalletAssets(assets),
        availableTokens: available,
      });
    },
  },
  {
    name: "exchange-pairs",
    description:
      "Use if the user wants to swap tokens, and the agent does not know which ones, suggest preferred exchange pairs, eg. unknown includes 'tokenIn' and 'tokenOut'; also choose this suggestion if an agent does not recognize the token",
    getPrompt: async (
      runtime,
      { address, chainId, conversation, decision }
    ) => {
      const service = runtime.getService<LevvaService>("levva");
      if (!service) {
        throw new Error("Failed to get levva service");
      }

      const assets = await service.getWalletAssets({ address, chainId });
      const available = await service.getAvailableTokens({ chainId });

      return exchangePairsPrompt({
        conversation,
        decision,
        walletAssetsFormatted: service.formatWalletAssets(assets),
        availableTokens: available,
      });
    },
  },
];
