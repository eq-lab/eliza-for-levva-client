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

export interface MessageQueryParams {
  where: WhereParams;
  orderBy: OrderByParams;
  limit: number;
}

export async function getChannelByName(runtime: IAgentRuntime, name: string) {
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
) {
  const db = getDb(runtime);

  return (await db
    .select()
    .from(schema.messageTable)
    .where(params.where)
    .orderBy(params.orderBy)
    .limit(params.limit)) as MessageEntry[];
}
