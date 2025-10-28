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

export interface SessionTimeoutConfig {
  timeoutMinutes?: number; // 5-1440, default: 30
  autoRenew?: boolean; // default: true
  maxDurationMinutes?: number; // default: 720 (12 hours)
  warningThresholdMinutes?: number; // default: 5
}

export interface SessionMetadata {
  platform?: string;
  username?: string;
  discriminator?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface CreateSessionRequest {
  agentId: UUID;
  userId: UUID;
  metadata?: SessionMetadata;
  timeoutConfig?: SessionTimeoutConfig;
}

export interface Session {
  sessionId: string;
  agentId: UUID;
  userId: UUID;
  createdAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
  metadata?: SessionMetadata;
  timeoutConfig?: SessionTimeoutConfig;
}
