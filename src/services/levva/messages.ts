import { eq } from "drizzle-orm";
import { PgSelectQueryBuilder } from "drizzle-orm/pg-core";
import { IAgentRuntime } from "@elizaos/core";
import { plugin } from "@elizaos/plugin-sql";
import { getDb } from "../../util/db";

const schema = plugin.schema;

type WhereParams = Parameters<PgSelectQueryBuilder["where"]>[0];
type OrderByParams = Parameters<PgSelectQueryBuilder["orderBy"]>[0];

export interface ChannelEntry {
  id: string;
  name: string;
  sourceType: string | null;
  sourceId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  messageServerId: string;
  type: string;
  topic: string | null;
}

export interface MessageEntry {
  authorId: string;
  rawMessage: {
    text?: string;
    message?: string;
    actions: string[];
    thought: string;
    metadata: Record<string, any>;
  };
}

export interface RoomEntry {
  id: string;
  channelId: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageQueryParams {
  where: WhereParams;
  orderBy: OrderByParams;
  limit: number;
}

export async function getChannelByName(
  runtime: IAgentRuntime,
  name: string
): Promise<ChannelEntry | undefined> {
  const db = getDb(runtime);

  return (
    (await db
      .select()
      .from(schema.channelTable)
      .where(eq(schema.channelTable.name, name))) as ChannelEntry[]
  )?.[0];
}

export async function getMessages(
  runtime: IAgentRuntime,
  params: MessageQueryParams
): Promise<MessageEntry[]> {
  const db = getDb(runtime);

  return (await db
    .select()
    .from(schema.messageTable)
    .where(params.where)
    .orderBy(params.orderBy)
    .limit(params.limit)) as MessageEntry[];
}

export async function getRoomsByChannelId(
  runtime: IAgentRuntime,
  channelId: string
): Promise<RoomEntry[]> {
  const db = getDb(runtime);

  return (await db
    .select()
    .from(schema.roomTable)
    .where(eq(schema.roomTable.channelId, channelId))) as RoomEntry[];
}

/**
 * Delete all memories (including messages) for a given room
 *
 * IMPORTANT: In ElizaOS, messages are stored in the memoryTable with type='messages'
 * The recentMessages provider reads from runtime.getMemories({ tableName: 'messages' })
 * So we need to delete ALL memories for the room, not just non-message memories.
 */
export async function deleteMemoriesByRoomId(
  runtime: IAgentRuntime,
  roomId: string
): Promise<number> {
  const db = getDb(runtime);

  // Delete ALL memories from the memories table where roomId matches
  // This includes both regular memories AND messages (type='messages')
  const result = await db
    .delete(schema.memoryTable)
    .where(eq(schema.memoryTable.roomId, roomId));

  // Drizzle returns an array for delete operations, count the length
  return Array.isArray(result) ? result.length : 0;
}
