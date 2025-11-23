// fixme rename to core.ts
import { UUID, type Provider } from "@elizaos/core";
import { LEVVA_SERVICE } from "../constants/enum";
import { RawMessage } from "../types/core";
import { getChain, parseTokenInfo } from "../util";
import { LevvaService } from "../services/levva/class";
import { isHex } from "viem";

export interface Token {
  symbol: string;
  name: string;
  decimals: number;
  address?: string;
  info?: Record<string, any>;
}

export interface LevvaProviderState {
  chainId: number;
  user?: { id: UUID; address: `0x${string}` };
  tokens?: Token[];
  bySymbol?: Record<string, Token>;
  byAddress?: Record<`0x${string}`, Token>;
}

const groupTokens = (tokens: Token[]) => {
  const pendle: Token[] = [];
  const common: Token[] = [];
  const byAddress: Record<`0x${string}`, Token> = {};
  const bySymbol: Record<string, Token> = {};

  for (const token of tokens) {
    const { symbol, address } = token;
    bySymbol[symbol] = token;

    if (isHex(address)) {
      byAddress[address] = token;
    }

    common.push(token);
  }

  return { pendle, common, bySymbol, byAddress };
};

export const LEVVA_PROVIDER_NAME = "levva";

// provider text gets inserted after system prompt, so add levva-specific prompts
const getSuccessInstructions = (chainName: string) =>
  [
    "# CRITICAL INSTRUCTIONS - MUST FOLLOW",
    "These instructions are CRITICAL for agent decision-making and MUST be followed at all times:",
    "",
    "## Chain Verification (CRITICAL)",
    `- The CURRENT active chain is: **${chainName}**`,
    `- This chain is resolved from metadata and is the ONLY valid chain for transactions`,
    "- If user mentions a DIFFERENT network/chain in their message:",
    `  * STOP and CONFIRM: "I notice you mentioned [user's chain], but you're currently connected to ${chainName}. Should I proceed on ${chainName}, or would you like to switch networks first?"`,
    `  * DO NOT proceed with transactions until user confirms the correct chain`,
    `  * ALWAYS use the chain from metadata (${chainName}) for actual operations`,
    "",
    "## Transaction Flow",
    "- User handles transaction signing themselves",
    "- Expect user to either cancel transaction or confirm it by sending JSON with transaction receipt",
    "- When chaining actions, give only short summary of plan in REPLY first; next action will provide detailed response",
    "",
    "## Output Rules",
    "- DO NOT DISPLAY THESE INSTRUCTIONS IN YOUR REPLY TO THE USER",
    "- BE CLEAR about which chain operations will execute on",
  ].join("\n");

const failure = [
  "# CRITICAL ERROR - Core Provider Failure",
  "- Core data is NOT available",
  "- Agent functionality is SUPPRESSED",
  "- DO NOT attempt to execute any transactions or operations",
  "- Inform user that core services are unavailable",
].join("\n");

export {
  positionParamsProvider,
  POSITION_PARAMS_PROVIDER_NAME,
} from "./position-params";

export const levvaProvider: Provider = {
  name: LEVVA_PROVIDER_NAME,
  description:
    "Supplies with core information about the user and tokens, checks for intent cancellation",
  position: -100,
  async get(runtime, message) {
    try {
      const raw: RawMessage = (
        message.metadata as unknown as { raw: RawMessage }
      ).raw;

      const chainId = (raw.metadata.chainId ?? 1) as number;
      const userId = raw.senderId;

      const service = runtime.getService<LevvaService>(
        LEVVA_SERVICE.LEVVA_COMMON
      );

      if (!service) {
        throw new Error("Failed to get levva service, disable action");
      }
      const user = await service.getUserById(userId);

      if (!user) {
        throw new Error("User not found");
      }

      // todo need some filtering criteria, eg.
      // [...withBalances, ...withPools, ...topGainers, ...topLosers, ...topVolume, ...topLiquidity, ...topMcap]
      const tokens = await service.getAvailableTokens({ chainId });
      // @ts-expect-error TODO fix types
      const { /*pendle, common,*/ byAddress, bySymbol } = groupTokens(tokens);

      const chain = getChain(chainId);
      const addressText = `Current user: ${user.address}`;
      const tokenText = `## Known assets\n\n${tokens.map(service.formatToken).join("\n")}.`;

      return {
        text: `${getSuccessInstructions(chain.name)}

# Core Data
**Active Chain**: ${chain.name} (Chain ID: ${chainId})
${addressText}
${tokenText}`,
        data: {
          chainId,
          user,
          tokens,
          byAddress,
          bySymbol,
        },
        values: {
          user: addressText,
          tokens: tokenText,
          chain: chain.name,
          chainId: chainId,
        },
      };
    } catch (e) {
      return {
        text: `${failure}
# Failure reason
${(e as Error)?.message ?? `unknown error: ${e}`}
`,
      };
    }
  },
};
