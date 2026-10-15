import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db, DbOrTx } from "@/db";
import { auditLog, payments, refunds } from "@/db/schema";
import { recordRefund } from "@/lib/billing/webhooks";
import { adjustCredits } from "@/lib/credits";
import { AppError } from "@/lib/errors";
import { findUserById } from "@/lib/users";

export const MAX_ADJUSTMENT = 100_000;

/**
 * Admin writes re-check the actor's role from the database themselves, so a
 * forgotten page guard or a forged server-action call still cannot get
 * through. Every write lands in the audit log in the same transaction.
 */
async function assertAdmin(db: Db, actorId: string) {
  const actor = await findUserById(db, actorId);
  if (!actor || actor.role !== "admin") throw new AppError("FORBIDDEN", "Admin access required");
  return actor;
}

function cleanReason(reason: string) {
  const r = reason.trim();
  if (r.length < 3) throw new AppError("VALIDATION", "A reason of at least 3 characters is required.");
  if (r.length > 500) throw new AppError("VALIDATION", "Keep the reason under 500 characters.");
  return r;
}

export async function adminAdjustCredits(
  db: Db,
  actorId: string,
  input: { userId: string; delta: number; reason: string; requestId: string },
) {
  await assertAdmin(db, actorId);
  const reason = cleanReason(input.reason);
  if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > MAX_ADJUSTMENT) {
    throw new AppError("VALIDATION", `Enter a whole number of credits between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}, not 0.`);
  }
  if (!(await findUserById(db, input.userId))) throw new AppError("NOT_FOUND", "User not found");

  return db.transaction(async (tx) => {
    // requestId comes from the form, so a double-submitted dialog posts once.
    const result = await adjustCredits(tx, {
      userId: input.userId,
      actorId,
      delta: input.delta,
      reason,
      key: input.requestId,
    });
    if (!result.duplicate) {
      await tx.insert(auditLog).values({
        actorId,
        action: "credits.adjust",
        targetUserId: input.userId,
        targetRef: result.transactionId,
        reason,
        details: { delta: input.delta },
      });
    }
    return result;
  });
}

type RefundsApi = Pick<Stripe, "refunds">;

/**
 * Refund money through Stripe, then book it locally (credit clawback + audit).
 *
 * The payment row stays locked across the Stripe call. That serialises
 * concurrent refunds of one payment and makes the `charge.refunded` webhook
 * (which locks the same row) wait until this refund is booked; its cumulative
 * `amount_refunded` then turns into a no-op in `recordRefund`. Holding a row
 * lock over a network call is acceptable here: admin-only, low volume.
 */
export async function adminRefund(
  db: Db,
  actorId: string,
  input: { paymentId: string; amountCents: number; reason: string; requestId: string },
  stripe: RefundsApi,
) {
  await assertAdmin(db, actorId);
  const reason = cleanReason(input.reason);

  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
    if (!payment) throw new AppError("NOT_FOUND", "Payment not found");
    if (!payment.paymentIntentId) {
      throw new AppError("VALIDATION", "This payment has no payment intent; refund it from the Stripe Dashboard.");
    }
    const already = await refundedCents(tx, payment.id);
    const remaining = payment.amountCents - already;
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > remaining) {
      throw new AppError("VALIDATION", `Refund between $0.01 and $${(remaining / 100).toFixed(2)}.`);
    }

    // A double-submitted form reuses requestId, so Stripe returns the same refund.
    const refund = await stripe.refunds.create(
      {
        payment_intent: payment.paymentIntentId,
        amount: input.amountCents,
        reason: "requested_by_customer",
        metadata: { paymentId: payment.id, actorId },
      },
      { idempotencyKey: `admin-refund:${input.requestId}` },
    );
    const [existing] = await tx.select().from(refunds).where(eq(refunds.id, refund.id));
    if (existing) return { refundId: refund.id, creditsReclaimed: existing.creditsReclaimed, duplicate: true };

    const applied = await recordRefund(tx, {
      payment,
      refundId: refund.id,
      cumulativeRefundedCents: already + input.amountCents,
      reason: `Refund: ${reason}`,
      actorId,
    });
    const [row] = await tx.select().from(refunds).where(eq(refunds.id, refund.id));
    const creditsReclaimed = row?.creditsReclaimed ?? 0;
    await tx.insert(auditLog).values({
      actorId,
      action: "payment.refund",
      targetUserId: payment.userId,
      targetRef: refund.id,
      reason,
      details: { paymentId: payment.id, amountCents: input.amountCents, creditsReclaimed, note: applied.note ?? null },
    });
    return { refundId: refund.id, creditsReclaimed, duplicate: false };
  });
}

async function refundedCents(db: DbOrTx, paymentId: string) {
  const [{ total }] = await db
    .select({ total: sql<string>`COALESCE(SUM(${refunds.amountCents}), 0)` })
    .from(refunds)
    .where(eq(refunds.paymentId, paymentId));
  return Number(total);
}
