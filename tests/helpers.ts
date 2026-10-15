import { sql } from "drizzle-orm";
import { afterAll } from "vitest";
import { createDb, type Db } from "@/db";
import { ledgerAccounts } from "@/db/schema";
import { SYSTEM } from "@/lib/ledger";
import { createUser } from "@/lib/users";
import { TEST_DATABASE_URL } from "./test-db-url";

let db: Db | undefined;

export function testDb(): Db {
  if (!db) {
    db = createDb(TEST_DATABASE_URL);
    afterAll(async () => {
      await db?.$client.end();
      db = undefined;
    });
  }
  return db;
}

/** Wipes all data and restores the system ledger accounts from migration 0002. */
export async function resetDb(d: Db = testDb()) {
  const tables = await d.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await d.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
  await d
    .insert(ledgerAccounts)
    .values(Object.values(SYSTEM).map((code) => ({ code, kind: "system" as const })));
}

let seq = 0;
export async function makeUser(overrides: { role?: "user" | "admin"; email?: string } = {}) {
  seq += 1;
  return createUser(testDb(), {
    email: overrides.email ?? `user${seq}-${Date.now()}@test.local`,
    name: `Test User ${seq}`,
    password: "password123",
    role: overrides.role,
  });
}

/** Resolves to the database's own error message (drizzle wraps it in `cause`). */
export async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("expected the query to fail");
}
