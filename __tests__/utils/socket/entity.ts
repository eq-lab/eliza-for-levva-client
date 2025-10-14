import { randomUUID, UUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { type SocketIOManager } from "./manager";
import {
  MessageBroadcastData,
  MessageCompleteData,
  SOCKET_MESSAGE_TYPE,
} from "./types";

export class ClientEntity {
  public readonly socket: Socket;
  private isConnected: boolean = false;
  private channels = new Set<UUID>();
  private replyTo?: UUID;
  private replies: Record<UUID, MessageBroadcastData[] | undefined> = {};
  /** @deprecated implement better check */
  public isTimedOut: boolean = false;

  private connectPromise: Promise<void>;
  private connectResolve?: () => void;

  constructor(
    private manager: SocketIOManager,
    public readonly id: UUID
  ) {
    this.socket = io(this.manager.config.baseUrl);

    this.connectPromise = new Promise((resolve) => {
      this.connectResolve = resolve;
    });

    this.socket.on("connect", () => {
      console.debug(`[SocketIO] Client ${this.id} connected`);
      this.isConnected = true;
      this.connectResolve?.();
    });

    this.socket.on("disconnect", (reason: string) => {
      console.debug(`[SocketIO] Client ${this.id} disconnected: ${reason}`);
      this.isConnected = false;

      // reset promise
      this.connectPromise = new Promise((resolve) => {
        this.connectResolve = resolve;
      });

      // if caused by server attempt to reconnect
      if (reason === "io server disconnect") {
        console.debug(`[SocketIO] Client ${this.id} reconnecting to server`);
        this.socket.connect();

        for (const channelId of this.channels) {
          this.joinChannel(channelId, true);
        }
      }
    });

    this.socket.on("messageBroadcast", (data: MessageBroadcastData) => {
      const channelId = data.channelId ?? data.roomId;

      console.debug(
        `[SocketIO] Client ${this.id} received message broadcast for channel ${channelId}, messageId: ${data.id}`
      );

      if (!channelId || !this.channels.has(channelId as UUID)) {
        return;
      }

      if (this.replyTo) {
        const replies = this.replies[this.replyTo];

        if (!replies) {
          throw new Error(`reply map not set for ${this.replyTo}`);
        }

        this.replies = {
          ...this.replies,
          [this.replyTo]: [...replies, data],
        };
      }
    });

    this.socket.on("messageComplete", (data: MessageCompleteData) => {
      const { channelId } = data;
      console.debug(
        `[SocketIO] Client ${this.id} received message complete for channel ${channelId}`
      );

      if (!channelId || !this.channels.has(channelId as UUID)) {
        return;
      }

      if (this.replyTo) {
        this.replyTo = undefined;
      }
    });
  }

  get connected() {
    return this.isConnected;
  }

  wait = () => this.connectPromise;

  disconnect = () => {
    this.socket.off("messageBroadcast");
    this.socket.off("messageComplete");
    this.socket.off("disconnect");
    this.socket.off("connect");
    this.socket.disconnect();
    this.channels.clear();
    this.isConnected = false;
    this.manager.resetClient(this.id);
    console.debug(`[SocketIO] Client ${this.id} disconnected`);
  };

  joinChannel = async (channelId: UUID, rejoin: boolean = false) => {
    if (!this.isConnected) {
      console.debug(
        `Client ${this.id} not connected, waiting for connection...`
      );

      await this.wait();
    }

    if (rejoin) {
      console.debug(
        `[SocketIO] Client ${this.id} re-joining channel: ${channelId}`
      );
    } else if (this.channels.has(channelId)) {
      console.debug(
        `[SocketIO] Client ${this.id} already in channel: ${channelId}`
      );

      return;
    }

    this.channels.add(channelId);

    this.socket.emit("message", {
      type: SOCKET_MESSAGE_TYPE.ROOM_JOINING,
      payload: {
        channelId,
        entityId: this.id,
      },
    });

    console.debug(`[SocketIO] Client ${this.id} joined channel: ${channelId}`);
  };

  leaveChannel = async (channelId: UUID) => {
    if (!this.isConnected) {
      console.warn(`[SocketIO] Client ${this.id} not connected, cannot leave`);
      return;
    }

    if (!this.channels.has(channelId)) {
      console.warn(`[SocketIO] Client ${this.id} not in channel: ${channelId}`);
      return;
    }

    this.channels.delete(channelId);
    // fixme no leave room message in elizaos implementation
  };

  sendMessage = async (
    message: string,
    channelId: string,
    serverId: string,
    source: string,
    attachments?: any[],
    metadata?: Record<string, any>
  ) => {
    // Wait for connection if needed
    if (!this.isConnected) {
      await this.wait();
    }

    const messageId = randomUUID();

    console.debug(
      `[SocketIO] Sending message to central channel ${channelId} on server ${serverId}`
    );

    // Emit message to server
    this.socket.emit("message", {
      type: SOCKET_MESSAGE_TYPE.SEND_MESSAGE,
      payload: {
        senderId: this.id,
        senderName: "user",
        message,
        channelId: channelId,
        roomId: channelId, // Keep for backward compatibility
        serverId: serverId, // Client uses serverId, not worldId
        messageId,
        source,
        attachments,
        metadata,
      },
    });

    this.replyTo = messageId;
    this.replies[messageId] = [];
    return messageId;
  };

  async *getRepliesIterator(
    messageId: UUID,
    waitFor: number = 60_000 // a minute seems overkill, need to adjust
  ) {
    if (!this.replies[messageId]) {
      throw new Error("Replies not found");
    }

    this.isTimedOut = false;
    let now = Date.now();

    for (let i = 0; ; ) {
      const replies = this.replies[messageId];
      const reply = replies?.[i];

      if (!reply) {
        if (this.replyTo === messageId) {
          // message was not completed yet, wait and try again
          const time = Date.now() - now;

          if (time > waitFor) {
            // waiting for too long, return
            this.replyTo = undefined;
            this.isTimedOut = true;
            return;
          }

          // wait for 500ms
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        // current reply to another message, can finish
        return;
      }

      console.debug(`[SocketIO] Client ${this.id} yielding reply ${reply.id}`);
      yield reply;
      i++;
      now = Date.now();
    }
  }
}
