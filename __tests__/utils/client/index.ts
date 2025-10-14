/**
 * Agent Client Library
 *
 * A flexible, adapter-based HTTP client for ElizaOS agents with Levva protocol support
 *
 * Features:
 * - Adapter pattern for flexible HTTP transport (fetch, axios, custom)
 * - Standard ElizaOS APIs (agents, messaging)
 * - Levva-specific endpoints (suggestions, calldata, cleanup)
 * - TypeScript support with full type safety
 *
 * @example Basic usage with fetch (default)
 * ```typescript
 * import { AgentClient } from './client';
 *
 * const client = AgentClient.create({
 *   baseUrl: 'http://localhost:3001',
 *   timeout: 30000,
 * });
 *
 * // Use standard ElizaOS APIs
 * const agents = await client.agents.listAgents();
 * const messages = await client.messaging.getChannelMessages(channelId);
 *
 * // Use Levva-specific APIs
 * const suggestions = await client.levva.getSuggestions(address, channelId, chainId);
 * ```
 *
 * @example Using with axios adapter
 * ```typescript
 * import axios from 'axios';
 * import { AgentClient, AxiosAdapter } from './client';
 *
 * const client = AgentClient.create({
 *   baseUrl: 'http://localhost:3001',
 *   adapter: new AxiosAdapter(axios),
 * });
 * ```
 *
 * @example Using with custom axios instance
 * ```typescript
 * import axios from 'axios';
 * import { AgentClient, AxiosAdapter } from './client';
 *
 * const customAxios = axios.create({
 *   baseURL: 'http://localhost:3001',
 *   timeout: 30000,
 * });
 *
 * const client = AgentClient.create({
 *   baseUrl: 'http://localhost:3001',
 *   adapter: new AxiosAdapter(customAxios),
 * });
 * ```
 */

// Core client
export { AgentClient } from "./client";

// Base classes and configuration
export { BaseApiClient, ApiError } from "./base-client";
export type { ApiClientConfig } from "./base-client";

// HTTP Adapters
export { FetchAdapter, AxiosAdapter } from "./adapters";
export type {
  HttpAdapter,
  HttpRequestConfig,
  HttpResponse,
  AxiosCompatible,
} from "./adapters";

// Standard ElizaOS services
export { AgentsService, MessagingService } from "./eliza";
export type {
  Agent,
  Message,
  MessageChannel,
  PaginationParams,
  MessageQueryParams,
} from "./eliza";

// Levva-specific service
export { LevvaService } from "./levva";
export type {
  ChannelEntry,
  CalldataWithDescription,
  Suggestion,
  CleanupResult,
} from "./levva";
