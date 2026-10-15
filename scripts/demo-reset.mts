/**
 * `npm run demo:reset`: wipes everything visitors created on the public demo
 * and seeds the demo data again. Meant for a nightly cron, e.g.
 *   docker compose exec app node scripts/demo-reset.mjs
 *
 * Only Creditly's own tables (those declared in src/db/schema.ts) are
 * truncated, without CASCADE, so a Postgres shared with other apps is left
 * alone.
 * Refuses to run unless DEMO_PUBLIC=1 or --force is given.
 */
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { createDb } from "../src/db/index.ts";
import * as schema from "../src/db/schema.ts";
import { ledgerAccounts } from "../src/db/schema.ts";
import { SYSTEM } from "../src/lib/ledger/index.ts";
import { seedDemo } from "./seed-data.mts";

if (process.env.DEMO_PUBLIC !== "1" && !process.argv.includes("--force")) {
  console.error("demo:reset deletes all data. Run with DEMO_PUBLIC=1 or pass --force.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
// Checked before anything is deleted: the seed needs it to recreate the admin.
if (!process.env.SEED_ADMIN_PASSWORD) throw new Error("SEED_ADMIN_PASSWORD is not set");

const tables = (Object.values(schema) as unknown[])
  .filter((t): t is PgTable => is(t, PgTable))
  .map((t) => `"public"."${getTableName(t)}"`);

const db = createDb(url);
try {
  const started = Date.now();
  // TRUNCATE bypasses the ledger's row-level append-only triggers by design;
  // it is the one sanctioned way to empty the books.
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY`));
    await tx.insert(ledgerAccounts).values(Object.values(SYSTEM).map((code) => ({ code, kind: "system" as const })));
  });
  console.log(`truncated ${tables.length} tables`);
  await seedDemo(db);
  console.log(`demo reset done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} finally {
  await db.$client.end();
}
