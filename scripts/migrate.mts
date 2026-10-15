import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(url: string) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    await client.end();
  }
}

/** On a cold boot the app can start before Postgres accepts connections. */
async function waitForDb(url: string, attempts = 30) {
  for (let i = 1; ; i++) {
    const client = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 5 });
    try {
      await client`select 1`;
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      console.log(`waiting for database (${(e as Error).message})`);
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      await client.end();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await waitForDb(url);
  await runMigrations(url);
  console.log("migrations applied");
}
