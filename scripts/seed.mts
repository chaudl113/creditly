/** `npm run seed`: idempotent, does nothing if demo users already exist. */
import { createDb } from "../src/db/index.ts";
import { seedDemo } from "./seed-data.mts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url);
try {
  await seedDemo(db);
} finally {
  await db.$client.end();
}
