import {
  type Chain,
  createPublicClient,
  fallback,
  http,
  type PublicClient,
  type Transport,
} from "viem";
import { mainnet, base, arbitrum } from "viem/chains";

// todo refactor
export const blockexplorers = new Map<number, string>([
  [1, "https://etherscan.io"],
  [137, "https://polygonscan.com"],
  [8453, "https://basescan.org"],
  [10, "https://optimistic.etherscan.io"],
  [42161, "https://arbiscan.io"],
]);

const clients: Record<number, PublicClient<Transport, Chain, undefined>> = {};
const endpoints: Record<number, string[] | undefined> = {
  1: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://0xrpc.io/eth",
    "https://rpc.mevblocker.io",
    "https://eth.drpc.org",
  ],
  8453: [
    "https://base-rpc.publicnode.com",
    "https://base.drpc.org",
    "https://base.meowrpc.com",
    "https://base.llamarpc.com",
  ],
  42161: [
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arbitrum.blockpi.network/v1/rpc/public",
    "https://arbitrum.meowrpc.com",
    "https://arbitrum.drpc.org",
  ],
};

const defaultRpcUrls: Record<number, string | undefined> = {
  1: process.env.ETHEREUM_BLOCKCHAIN_RPC_URL,
  8453: process.env.BASE_BLOCKCHAIN_RPC_URL,
};

export const getChain = (chainId: number = 1) => {
  switch (chainId) {
    case 1:
      return mainnet;
    case 8453:
      return base;
    case 42161:
      return arbitrum;
    default:
      throw new Error(`Unsupported chain id: ${chainId}`);
  }
};

export const getClient = (chain: Chain) => {
  if (!clients[chain.id]) {
    let rpcs = endpoints[chain.id];

    if (!rpcs?.length) {
      throw new Error(`No endpoints found for chain id: ${chain.id}`);
    }

    rpcs = chain.rpcUrls.default.http.concat(rpcs);

    const client = createPublicClient<Transport, Chain, undefined>({
      chain,
      transport: fallback(rpcs.map((rpc) => http(rpc))),
    }) as PublicClient<Transport, Chain, undefined>;

    clients[chain.id] = client;
  }

  return clients[chain.id];
};
