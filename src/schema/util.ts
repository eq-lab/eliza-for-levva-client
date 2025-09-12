import { AnyPgColumn } from "drizzle-orm/pg-core";
import { SQL, sql } from "drizzle-orm";

export function lower(address: AnyPgColumn): SQL {
  return sql`lower(${address})`;
}
