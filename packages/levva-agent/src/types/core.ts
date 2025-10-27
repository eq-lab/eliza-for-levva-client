import { UUID } from "@elizaos/core";

export interface RawMessage {
  senderId: UUID;
  senderName: string;
  message: string;
  channelId: UUID;
  roomId: UUID;
  serverId: UUID;
  messageId: UUID;
  source: string;
  metadata: Record<string, unknown>;
}

export interface CacheEntry<T> {
  hash?: `0x${string}`;
  timestamp?: number;
  value: T;
}
