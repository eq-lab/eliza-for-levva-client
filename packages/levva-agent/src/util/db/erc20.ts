// todo move db helpers to service
import { and, eq, inArray, InferSelectModel, sql } from "drizzle-orm";
import { getAddress } from "viem";
import type { IAgentRuntime } from "@elizaos/core";
import { getDb } from "./client";
import { erc20Table } from "../../schema/erc20";
import { lower } from "../../schema/util";
import type { TokenData, TokenInfo } from "../../types/token";

interface GetTokenParams {
  chainId: number;
  address?: `0x${string}` | `0x${string}`[];
  symbol?: string;
}

export type TokenEntry = InferSelectModel<typeof erc20Table>;

export const getToken = async (
  runtime: IAgentRuntime,
  params: GetTokenParams
) => {
  const db = getDb(runtime);

  if (params.address) {
    return await db
      .select()
      .from(erc20Table)
      .where(
        and(
          eq(erc20Table.chainId, params.chainId),
          Array.isArray(params.address)
            ? inArray(erc20Table.address, params.address.map(getAddress))
            : eq(erc20Table.address, getAddress(params.address))
        )
      );
  } else if (params.symbol) {
    return await db
      .select()
      .from(erc20Table)
      .where(
        and(
          eq(erc20Table.chainId, params.chainId),
          eq(lower(erc20Table.symbol), params.symbol.toLowerCase())
        )
      );
  } else {
    return await db
      .select()
      .from(erc20Table)
      .where(eq(erc20Table.chainId, params.chainId));
  }
};

export const upsertTokens = async (
  runtime: IAgentRuntime,
  values: (Required<TokenData> & { chainId: number; info?: TokenInfo })[]
) => {
  const db = getDb(runtime);
  const valuesToInsert = values.map((v) => {
    const { address: _address, ...rest } = v;
    const address = getAddress(_address);
    return { ...rest, address };
  });

  const action = db.insert(erc20Table).values(valuesToInsert);

  await action.onConflictDoUpdate({
    target: [erc20Table.chainId, erc20Table.address, erc20Table.symbol],
    set: {
      info: sql`COALESCE(excluded.info, ${erc20Table.info})`,
    },
  });
};
