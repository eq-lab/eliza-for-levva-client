import { z } from "zod";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getAddress } from "viem";
import { erc20Table } from "../src/schema";
import { LEVVA_API_V1_BASEURL } from "../src/api/levva/constants";

const levvaTokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  priceUsd: z.number().optional(),
  protocol: z.string().nullable().optional(),
});

const levvaTokensResponseSchema = z.array(levvaTokenSchema);

type LevvaToken = z.infer<typeof levvaTokenSchema>;

async function fetchTokensByChain(chainId: number): Promise<LevvaToken[]> {
  const url = `${LEVVA_API_V1_BASEURL}/token/${chainId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return levvaTokensResponseSchema.parse(data);
}

async function insertTokensToDb(
  tokens: LevvaToken[],
  chainId: number
): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
  });
  const db = drizzle(pool);

  try {
    for (const token of tokens) {
      try {
        await db
          .insert(erc20Table)
          .values({
            address: getAddress(token.address),
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            chainId: chainId,
          })
          .onConflictDoUpdate({
            target: [erc20Table.address, erc20Table.chainId, erc20Table.symbol],
            set: {
              name: token.name,
              decimals: token.decimals,
            },
          });
      } catch (error) {
        console.error(`Failed to insert ${token.symbol}:`, error);
      }
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const targetChains = [1, 8453];

  for (const chainId of targetChains) {
    try {
      const tokens = await fetchTokensByChain(chainId);
      await insertTokensToDb(tokens, chainId);
    } catch (error) {
      console.error(`Error processing chain ${chainId}:`, error);
    }
  }
  console.log("finished");
}

main();
