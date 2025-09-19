import {
  ApiClientConfig,
  BaseApiClient,
  ElizaClient,
} from "@elizaos/api-client";

import { UUID } from "@elizaos/core";

export interface ChannelEntry {
  id: string;
  name: string;
  sourceType: string | null;
  sourceId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  messageServerId: string;
  type: string;
  topic: string | null;
}

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
  getUserId = async (params: { address: `0x${string}`; secret: string }) => {
    return this.get<{ id?: UUID }>(
      `/api/levva/levva-user?address=${params.address}`,
      {
        headers: {
          Authorization: `Bearer ${params.secret}`,
        },
      }
    );
  };

  /**
   * @description get channel by name
   * @param name - channel name
   */
  getChannelByName = (name: string) =>
    this.get<ChannelEntry | undefined>(`/api/levva/chan?name=${name}`);

  /**
   * @description suggestions for user input
   * @param address - address of the user
   * @param channelId - id of the channel
   * @param chainId - id of the evm chain, currently only mainnet(1) is supported
   */
  getSuggestions = (address: `0x${string}`, channelId: UUID, chainId: number) =>
    this.get<{ suggestions: { label: string; text: string }[] }>(
      `/api/levva/suggest?address=${address}&channelId=${channelId}&chainId=${chainId}`
    );

  /**
   * @description receive calldata from attachment
   * @param url - pass url received from attachment
   */
  getCalldata = async ({ url }: { url: string }) => {
    if (!url.startsWith(`/api/levva/calldata?hash=`)) {
      throw new Error("Invalid URL");
    }

    return this.get<CalldataWithDescription[]>(url);
  };

  status = async (address: `0x${string}`) =>
    this.get<{ ready: boolean }>(`/api/levva/status?address=${address}`);
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
