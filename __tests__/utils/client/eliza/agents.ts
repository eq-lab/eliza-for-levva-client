/**
 * Standard ElizaOS Agents API
 */

import { BaseApiClient } from "../base-client";
import type { Agent } from "./types";
import type { UUID } from "@elizaos/core";

export class AgentsService extends BaseApiClient {
  /**
   * List all available agents
   */
  async listAgents(): Promise<{ agents: Agent[] }> {
    return this.get<{ agents: Agent[] }>("/api/agents");
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: UUID): Promise<Agent> {
    return this.get<Agent>(`/api/agents/${agentId}`);
  }
}
