import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;
/** A database handle or an open transaction — services accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  return drizzle(client, { schema });
}

// One pool per server process (survives Next dev hot reloads).
const globalForDb = globalThis as unknown as { __creditlyDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__creditlyDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__creditlyDb = createDb(url);
  }
  return globalForDb.__creditlyDb;
}
