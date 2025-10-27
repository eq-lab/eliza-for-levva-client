export type MessageBroadcastData = {
  senderId: string;
  senderName: string;
  text: string;
  channelId: string;
  roomId?: string; // Deprecated - for backward compatibility only
  createdAt: number;
  source: string;
  name: string; // Required for ContentWithUser compatibility
  attachments?: any[];
  thought?: string; // Agent's thought process
  actions?: string[]; // Actions taken by the agent
  prompt?: string; // The LLM prompt used to generate this message
  [key: string]: any;
};

export type MessageCompleteData = {
  channelId: string;
  roomId?: string; // Deprecated - for backward compatibility only
  [key: string]: any;
};

// Define type for control messages
export type ControlMessageData = {
  action: "enable_input" | "disable_input";
  target?: string;
  channelId: string;
  roomId?: string; // Deprecated - for backward compatibility only
  [key: string]: any;
};

// Define type for message deletion events
export type MessageDeletedData = {
  messageId: string;
  channelId: string;
  roomId?: string; // Deprecated - for backward compatibility only
  [key: string]: any;
};

// Define type for channel cleared events
export type ChannelClearedData = {
  channelId: string;
  roomId?: string; // Deprecated - for backward compatibility only
  [key: string]: any;
};

// Define type for channel deleted events
export type ChannelDeletedData = {
  channelId: string;
  roomId?: string; // Deprecated - for backward compatibility only
  [key: string]: any;
};

export enum SOCKET_MESSAGE_TYPE {
  ROOM_JOINING = 1,
  SEND_MESSAGE = 2,
  MESSAGE = 3,
  ACK = 4,
  THINKING = 5,
  CONTROL = 6,
}

export enum ChannelType {
  SELF = "SELF", // Messages to self
  DM = "DM", // Direct messages between two participants
  GROUP = "GROUP", // Group messages with multiple participants
  VOICE_DM = "VOICE_DM", // Voice direct messages
  VOICE_GROUP = "VOICE_GROUP", // Voice channels with multiple participants
  FEED = "FEED", // Social media feed
  THREAD = "THREAD", // Threaded conversation
  WORLD = "WORLD", // World channel
  FORUM = "FORUM", // Forum discussion
  API = "API",
}
