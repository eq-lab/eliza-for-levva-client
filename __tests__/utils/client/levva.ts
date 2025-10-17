/**
 * Levva-specific API routes
 * Custom endpoints for Levva protocol integration
 */

import { BaseApiClient } from "./base-client";
import type { UUID } from "@elizaos/core";

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

export interface CalldataWithDescription {
  title: string;
  description: string;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
}

export interface Suggestion {
  label: string;
  text: string;
}

export interface CleanupResult {
  clearedMemories: number;
  cancelledIntents: number;
  clearedSuggestions: boolean;
  clearedLoadingState: boolean;
}

export class LevvaService extends BaseApiClient {
  /**
   * Get user ID by wallet address
   * @param address - User's wallet address
   * @param secret - API secret for authentication
   */
  async getUserId(params: {
    address: `0x${string}`;
    secret: string;
  }): Promise<{ id?: UUID }> {
    return this.get<{ id?: UUID }>(
      `/api/levva/levva-user?address=${params.address}`,
      {
        headers: {
          Authorization: `Bearer ${params.secret}`,
        },
      }
    );
  }

  /**
   * Get channel by name
   * @param name - Channel name
   */
  async getChannelByName(name: string): Promise<ChannelEntry | undefined> {
    return this.get<ChannelEntry | undefined>(`/api/levva/chan?name=${name}`);
  }

  /**
   * Get context-aware suggestions for user input
   * @param address - User's wallet address
   * @param channelId - Channel ID
   * @param chainId - EVM chain ID (currently only mainnet=1 supported)
   */
  async getSuggestions(
    address: `0x${string}`,
    channelId: UUID,
    chainId: number
  ): Promise<{ suggestions: Suggestion[] }> {
    return this.get<{ suggestions: Suggestion[] }>(
      `/api/levva/suggest?address=${address}&channelId=${channelId}&chainId=${chainId}`
    );
  }

  /**
   * Receive calldata from attachment URL
   * @param url - Calldata URL received from agent attachment
   */
  async getCalldata(params: {
    url: string;
  }): Promise<CalldataWithDescription[]> {
    if (!params.url.startsWith(`/api/levva/calldata?hash=`)) {
      throw new Error("Invalid URL: Must start with /api/levva/calldata?hash=");
    }

    return this.get<CalldataWithDescription[]>(params.url);
  }

  /**
   * Check if agent is ready for the given address
   * @param address - User's wallet address
   */
  async getStatus(address: `0x${string}`): Promise<{ ready: boolean }> {
    return this.get<{ ready: boolean }>(`/api/levva/status?address=${address}`);
  }

  /**
   * Clear suggestions cache for user
   * @param address - User's wallet address
   * @param chainId - EVM chain ID
   */
  async clearSuggestions(
    address: `0x${string}`,
    chainId: number
  ): Promise<{
    success: boolean;
    message: string;
    data: { cacheKey: string };
  }> {
    return this.delete<{
      success: boolean;
      message: string;
      data: { cacheKey: string };
    }>(`/api/levva/clear-suggest?address=${address}&chainId=${chainId}`);
  }

  /**
   * Cleanup channel state before clearing messages
   * Cancels active intents, clears suggestions cache, and removes memories
   * @param channelId - Channel ID to cleanup
   * @param userId - User ID for cache clearing
   */
  async cleanupChannel(channelId: UUID, userId: UUID): Promise<CleanupResult> {
    return this.get<CleanupResult>(
      `/api/levva/cleanup?channelId=${channelId}&userId=${userId}`
    );
  }
}
