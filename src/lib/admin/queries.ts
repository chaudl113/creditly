import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db";
import { aiJobs, auditLog, stripeEvents, subscriptions, users } from "@/db/schema";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/checkout";
import { trialBalance } from "@/lib/ledger";

const DAY = 86_400_000;

export async function overview(db: DbOrTx, now = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const since24h = new Date(now.getTime() - DAY);
  const [[mrr], [userCounts], [jobs], [webhooks], ledger, revenue] = await Promise.all([
    db
      .select({ cents: sql<string>`COALESCE(SUM(${subscriptions.priceCents}), 0)`, subs: count() })
      .from(subscriptions)
      .where(inArray(subscriptions.status, LIVE_SUBSCRIPTION_STATUSES)),
    db
      .select({
        total: count(),
        new7d: sql<number>`count(*) FILTER (WHERE ${users.createdAt} > ${since7.toISOString()})::int`,
      })
      .from(users),
    db
      .select({
        total: count(),
        failed: sql<number>`count(*) FILTER (WHERE ${aiJobs.status} = 'failed')::int`,
        credits: sql<number>`COALESCE(SUM(${aiJobs.creditsCharged}), 0)::int`,
      })
      .from(aiJobs)
      .where(gt(aiJobs.createdAt, since24h)),
    db
      .select({
        failed: sql<number>`count(*) FILTER (WHERE ${stripeEvents.status} = 'failed')::int`,
        duplicates: sql<number>`COALESCE(SUM(${stripeEvents.deliveries} - 1), 0)::int`,
        total: count(),
      })
      .from(stripeEvents),
    trialBalance(db),
    revenueByDay(db, since30, now),
  ]);
  return {
    mrrCents: Number(mrr.cents),
    activeSubscriptions: mrr.subs,
    users: userCounts,
    jobs24h: jobs,
    webhooks,
    ledger,
    revenue,
    revenue30dCents: revenue.reduce((acc, d) => acc + d.netCents, 0),
  };
}

/** Gross payments minus refunds per UTC day, with zero-filled gaps. */
export async function revenueByDay(db: DbOrTx, fromDate: Date, toDate: Date) {
  // Raw SQL bypasses column mappers, so dates go in as ISO strings.
  const from = fromDate.toISOString();
  const to = toDate.toISOString();
  const rows = await db.execute<{ day: string; gross: string; refunded: string }>(sql`
    WITH days AS (
      SELECT generate_series(date_trunc('day', ${from}::timestamptz AT TIME ZONE 'UTC'),
                             date_trunc('day', ${to}::timestamptz AT TIME ZONE 'UTC'),
                             interval '1 day')::date AS day
    ),
    gross AS (
      SELECT (paid_at AT TIME ZONE 'UTC')::date AS day, SUM(amount_cents) AS cents
      FROM payments WHERE paid_at >= ${from} GROUP BY 1
    ),
    refunded AS (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, SUM(amount_cents) AS cents
      FROM refunds WHERE created_at >= ${from} GROUP BY 1
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
           COALESCE(gross.cents, 0) AS gross,
           COALESCE(refunded.cents, 0) AS refunded
    FROM days
    LEFT JOIN gross ON gross.day = days.day
    LEFT JOIN refunded ON refunded.day = days.day
    ORDER BY days.day
  `);
  return rows.map((r) => ({
    day: r.day,
    grossCents: Number(r.gross),
    refundedCents: Number(r.refunded),
    netCents: Number(r.gross) - Number(r.refunded),
  }));
}

/** Every user with balance, live plan and lifetime spend in one round-trip. */
export async function listUsers(db: DbOrTx) {
  // Correlated subqueries spelled out with table names: drizzle drops the
  // qualifier on single-table selects, which would make "id" ambiguous here.
  const balance = sql<number>`COALESCE((
    SELECT SUM(e.amount) FROM ledger_entries e
    JOIN ledger_accounts a ON a.id = e.account_id
    WHERE a.user_id = "users"."id"), 0)::int`;
  const paid = sql<number>`COALESCE((
    SELECT SUM(p.amount_cents) FROM payments p WHERE p.user_id = "users"."id"), 0)::int`;
  const plan = sql<string | null>`(
    SELECT s.plan_key FROM subscriptions s
    WHERE s.user_id = "users"."id" AND s.status IN ${LIVE_SUBSCRIPTION_STATUSES}
    LIMIT 1)`;
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      balance,
      paidCents: paid,
      plan,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function webhookEvents(db: DbOrTx, status?: string, limit = 100) {
  const valid = ["pending", "processed", "ignored", "failed"] as const;
  const filter = valid.find((s) => s === status);
  return db
    .select({
      id: stripeEvents.id,
      type: stripeEvents.type,
      status: stripeEvents.status,
      attempts: stripeEvents.attempts,
      deliveries: stripeEvents.deliveries,
      note: stripeEvents.note,
      lastError: stripeEvents.lastError,
      stripeCreatedAt: stripeEvents.stripeCreatedAt,
      receivedAt: stripeEvents.receivedAt,
      processedAt: stripeEvents.processedAt,
    })
    .from(stripeEvents)
    .where(filter ? eq(stripeEvents.status, filter) : undefined)
    .orderBy(desc(stripeEvents.receivedAt))
    .limit(limit);
}

export async function auditEntries(db: DbOrTx, opts: { targetUserId?: string; limit?: number } = {}) {
  const actor = alias(users, "actor");
  const target = alias(users, "target");
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      reason: auditLog.reason,
      details: auditLog.details,
      targetRef: auditLog.targetRef,
      createdAt: auditLog.createdAt,
      actorEmail: actor.email,
      targetUserId: auditLog.targetUserId,
      targetEmail: target.email,
    })
    .from(auditLog)
    .innerJoin(actor, eq(actor.id, auditLog.actorId))
    .leftJoin(target, eq(target.id, auditLog.targetUserId))
    .where(opts.targetUserId ? and(eq(auditLog.targetUserId, opts.targetUserId)) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(opts.limit ?? 100);
}
