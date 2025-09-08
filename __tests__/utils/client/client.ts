import {
  ApiClientConfig,
  ApiError,
  ApiResponse,
  BaseApiClient,
  ElizaClient,
} from "@elizaos/api-client";

console.log("ElizaClient:", ElizaClient);
console.log("BaseApiClient:", BaseApiClient);
import { UUID } from "@elizaos/core";

export type CalldataWithDescription = {
  title: string;
  description: string;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string | undefined;
};

class LevvaAgentClient extends BaseApiClient {
  /**
   * @description get user id by address
   * @param proxy - proxy to the api endpoint
   * @param address - user address(make sure it's not used on frontend)
   * @param secret - API secret(make sure it's not used on frontend)
   */
  getUserId = async (
    params: { proxy: string } | { address: `0x${string}`; secret: string }
  ) => {
    if ("proxy" in params) {
      const request = await fetch(params.proxy);
      if (!request.ok) {
        throw new ApiError(
          "HTTP_ERROR",
          `HTTP ${request.status}: ${request.statusText}`
        );
      }

      const response: ApiResponse<{ id?: UUID }> = await request.json();

      if (!response.success) {
        throw new ApiError(
          response.error.code,
          response.error.message,
          response.error.details
        );
      }

      return response.data;
    } else {
      return this.get<{ id?: UUID }>(
        `/api/levva-user?address=${params.address}`,
        {
          headers: {
            Authorization: `Bearer ${params.secret}`,
          },
        }
      );
    }
  };

  /**
   * @description suggestions for user input
   * @param address - address of the user
   * @param channelId - id of the channel
   * @param chainId - id of the evm chain, currently only mainnet(1) is supported
   */
  getSuggestions = (address: `0x${string}`, channelId: UUID, chainId: number) =>
    this.get<{ suggestions: { label: string; text: string }[] }>(
      `/suggest?address=${address}&channelId=${channelId}&chainId=${chainId}`
    );

  /**
   * @description receive calldata from attachment
   * @param url - pass url received from attachment
   */
  getCalldata = async ({ url }: { url: string }) => {
    if (!url.startsWith(`/api/calldata?hash=`)) {
      throw new Error("Invalid URL");
    }

    return this.get<CalldataWithDescription[]>(url);
  };

  status = async (address: `0x${string}`) =>
    this.get<{ ready: boolean }>(`/api/status?address=${address}`);
}

export class AgentClient extends ElizaClient {
  private static instance: AgentClient;

  public readonly levva: LevvaAgentClient;

  constructor(config: ApiClientConfig) {
    super(config);
    this.levva = new LevvaAgentClient(config);
  }

  static create(config: ApiClientConfig) {
    if (AgentClient.instance) {
      throw new Error("AgentClient already initialized");
    }

    AgentClient.instance = new AgentClient(config);
    return AgentClient.instance;
  }

  static getInstance() {
    if (!AgentClient.instance) {
      throw new Error("AgentClient not initialized");
    }

    return AgentClient.instance;
  }

  static getOrCreateInstance(config: ApiClientConfig) {
    if (AgentClient.instance) {
      return AgentClient.instance;
    }

    return AgentClient.create(config);
  }
}
