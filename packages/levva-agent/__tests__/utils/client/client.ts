/**
 * Main Agent Client
 * Provides access to ElizaOS standard APIs and Levva-specific routes
 */

import { ApiClientConfig } from "./base-client";
import { AgentsService, MessagingService } from "./eliza";
import { LevvaService } from "./levva";

export class AgentClient {
  private static instance: AgentClient;

  public readonly agents: AgentsService;
  public readonly messaging: MessagingService;
  public readonly levva: LevvaService;

  constructor(config: ApiClientConfig) {
    // Standard ElizaOS services
    this.agents = new AgentsService(config);
    this.messaging = new MessagingService(config);

    // Levva-specific service
    this.levva = new LevvaService(config);
  }

  static create(config: ApiClientConfig): AgentClient {
    if (AgentClient.instance) {
      throw new Error("AgentClient already initialized");
    }

    AgentClient.instance = new AgentClient(config);
    return AgentClient.instance;
  }

  static getInstance(): AgentClient {
    if (!AgentClient.instance) {
      throw new Error("AgentClient not initialized");
    }

    return AgentClient.instance;
  }

  static getOrCreateInstance(config: ApiClientConfig): AgentClient {
    if (AgentClient.instance) {
      return AgentClient.instance;
    }

    return AgentClient.create(config);
  }
}
