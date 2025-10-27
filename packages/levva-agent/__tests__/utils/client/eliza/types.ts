/**
 * Type definitions for standard ElizaOS API
 * These align with @elizaos/api-client types
 */

import type { UUID } from "@elizaos/core";

export interface Agent {
  id: UUID;
  name: string;
}

export interface Message {
  id: UUID;
  text: string;
  senderId: UUID;
  channelId: UUID;
  createdAt: number;
}

export interface MessageChannel {
  id: UUID;
  name?: string;
  type?: string;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
  messageServerId?: string;
  topic?: string | null;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface MessageQueryParams extends PaginationParams {
  before?: Date | string;
  after?: Date | string;
}
