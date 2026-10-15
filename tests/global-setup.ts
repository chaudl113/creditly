import postgres from "postgres";
import { runMigrations } from "../scripts/migrate.mts";
import { TEST_DATABASE_URL } from "./test-db-url";

/** Recreates the test database from migrations once per `npm test` run. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!/_test$/.test(dbName)) throw new Error(`Refusing to reset non-test database "${dbName}"`);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin`select 1`;
  } catch (e) {
    await admin.end().catch(() => {});
    throw new Error(
      `Cannot reach Postgres at ${url.host}. Start it with: docker compose up -d db\n${String(e)}`,
    );
  }
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  await admin.end();
  await runMigrations(TEST_DATABASE_URL);
}
