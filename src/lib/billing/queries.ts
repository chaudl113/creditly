import { desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { payments, refunds, subscriptions } from "@/db/schema";

export async function latestSubscription(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);
  return row;
}

/** Payments with how much of each has been refunded. */
export async function paymentsWithRefunds(db: DbOrTx, opts: { userId?: string; limit?: number } = {}) {
  const rows = await db
    .select({ payment: payments, refundedCents: sql<string>`COALESCE(SUM(${refunds.amountCents}), 0)` })
    .from(payments)
    .leftJoin(refunds, eq(refunds.paymentId, payments.id))
    .where(opts.userId ? eq(payments.userId, opts.userId) : undefined)
    .groupBy(payments.id)
    .orderBy(desc(payments.paidAt))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({ ...r.payment, refundedCents: Number(r.refundedCents) }));
}
