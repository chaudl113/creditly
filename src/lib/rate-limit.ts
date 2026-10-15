import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { rateLimits } from "@/db/schema";

export type Limit = { max: number; windowMs: number };

/** Per-IP limits for the public demo. Generous enough for a person clicking around. */
export const AUTH_LIMITS = {
  login: { max: 20, windowMs: 10 * 60_000 },
  demoLogin: { max: 30, windowMs: 10 * 60_000 },
  signup: { max: 5, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;

/**
 * Fixed-window counter in Postgres: one upsert per hit, so it holds across
 * restarts and multiple app instances. Returns false once `max` is exceeded.
 */
export async function hit(db: DbOrTx, key: string, limit: Limit, now = new Date()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / limit.windowMs) * limit.windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end`,
        windowStart: sql`excluded.window_start`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count <= limit.max;
}

/**
 * Client IP from the header the reverse proxy sets. Behind Cloudflare use
 * CLIENT_IP_HEADER=cf-connecting-ip; X-Forwarded-For takes the first hop.
 */
export function clientIp(headers: Headers): string {
  const name = process.env.CLIENT_IP_HEADER || "x-forwarded-for";
  const value = headers.get(name) ?? "";
  return value.split(",")[0].trim() || "unknown";
}
