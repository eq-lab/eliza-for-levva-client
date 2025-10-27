/**
 * Standard ElizaOS Messaging API
 */

import { BaseApiClient } from "../base-client";
import type { Message, MessageChannel, MessageQueryParams } from "./types";
import type { UUID } from "@elizaos/core";

export class MessagingService extends BaseApiClient {
  /**
   * Find or create a DM channel between two users
   */
  async getOrCreateDmChannel(params: {
    participantIds: UUID[];
  }): Promise<MessageChannel> {
    const [userA, userB] = params.participantIds;
    const query = {
      currentUserId: userA,
      targetUserId: userB,
      dmServerId: "00000000-0000-0000-0000-000000000000" as UUID,
    };
    return this.get<MessageChannel>("/api/messaging/dm-channel", {
      params: query,
    });
  }

  /**
   * Get messages from a channel with optional pagination
   */
  async getChannelMessages(
    channelId: UUID,
    params?: MessageQueryParams
  ): Promise<{ messages: Message[] }> {
    const queryParams = params
      ? Object.fromEntries(
          Object.entries(params).map(([key, value]) => [
            key,
            value instanceof Date ? value.toISOString() : String(value),
          ])
        )
      : undefined;

    return this.get<{ messages: Message[] }>(
      `/api/messaging/central-channels/${channelId}/messages`,
      { params: queryParams }
    );
  }

  /**
   * Clear all messages from a channel
   */
  async clearChannelHistory(channelId: UUID): Promise<{ deleted: number }> {
    return this.delete<{ deleted: number }>(
      `/api/messaging/central-channels/${channelId}/messages`
    );
  }
}
