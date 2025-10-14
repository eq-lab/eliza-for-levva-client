import { UUID } from "node:crypto";
import { ClientEntity } from "./entity";

let instance: SocketIOManager | undefined;

interface SocketConfig {
  baseUrl?: string;
}

export class SocketIOManager {
  static configure(config: SocketConfig) {
    if (instance) {
      console.warn(
        `SocketIOManager already configured with ${JSON.stringify(instance.config)}`
      );

      return;
    }

    instance = new SocketIOManager(config);
  }

  static getInstance() {
    if (!instance) {
      throw new Error("SocketIOManager not configured");
    }

    return instance;
  }

  private clients = new Map<UUID, ClientEntity>();
  private constructor(public readonly config: SocketConfig) {}

  initClient(userId: UUID) {
    const client = new ClientEntity(this, userId);
    this.clients.set(userId, client);
    return client;
  }

  getClient(userId: UUID) {
    const result = this.clients.get(userId);

    if (!result) {
      throw new Error(`Client not found for user ${userId}`);
    }

    return result;
  }

  resetClient(userId: UUID) {
    this.clients.delete(userId);
  }
}
