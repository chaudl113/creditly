import type { DbOrTx } from "@/db";
import { SIGNUP_CREDITS } from "@/lib/billing/catalog";
import { AppError } from "@/lib/errors";
import {
  SYSTEM,
  getUserBalance,
  lockUserAccounts,
  postTransaction,
  type Posting,
  userAccountCode,
} from "@/lib/ledger";

/**
 * Business operations on the credit ledger. Each one is a single balanced
 * transaction with a natural idempotency key, so retries never double-post.
 */

export function grantSignupCredits(db: DbOrTx, userId: string) {
  return postTransaction(db, {
    type: "signup_grant",
    idempotencyKey: `signup:${userId}`,
    memo: `Free plan welcome credits`,
    userId,
    postings: [
      { account: SYSTEM.grants, amount: -SIGNUP_CREDITS },
      { account: userAccountCode(userId), amount: SIGNUP_CREDITS },
    ],
  });
}

export function grantPlanCredits(
  db: DbOrTx,
  input: { userId: string; invoiceId: string; credits: number; planName: string },
) {
  return postTransaction(db, {
    type: "plan_grant",
    idempotencyKey: `invoice:${input.invoiceId}:grant`,
    memo: `${input.planName} monthly allowance`,
    userId: input.userId,
    ref: input.invoiceId,
    postings: [
      { account: SYSTEM.grants, amount: -input.credits },
      { account: userAccountCode(input.userId), amount: input.credits },
    ],
  });
}

export function creditPurchase(
  db: DbOrTx,
  input: { userId: string; paymentRef: string; credits: number; packName: string },
) {
  return postTransaction(db, {
    type: "purchase",
    idempotencyKey: `purchase:${input.paymentRef}`,
    memo: `Purchased ${input.packName}`,
    userId: input.userId,
    ref: input.paymentRef,
    postings: [
      { account: SYSTEM.sales, amount: -input.credits },
      { account: userAccountCode(input.userId), amount: input.credits },
    ],
  });
}

/** Reserve credits before an AI job runs. Throws INSUFFICIENT_CREDITS. */
export function holdCredits(db: DbOrTx, input: { userId: string; jobId: string; amount: number }) {
  return postTransaction(db, {
    type: "usage_hold",
    idempotencyKey: `job:${input.jobId}:hold`,
    memo: `Reserved for AI job`,
    userId: input.userId,
    ref: input.jobId,
    postings: [
      { account: userAccountCode(input.userId), amount: -input.amount },
      { account: SYSTEM.holds, amount: input.amount },
    ],
  });
}

/** Job succeeded: charge the actual cost, return the unused reservation. */
export function settleHold(
  db: DbOrTx,
  input: { userId: string; jobId: string; reserved: number; charged: number },
) {
  const { reserved, charged } = input;
  if (!Number.isSafeInteger(charged) || charged < 0 || charged > reserved) {
    throw new AppError("VALIDATION", `Charge ${charged} must be within the reservation ${reserved}`);
  }
  const postings: Posting[] = [{ account: SYSTEM.holds, amount: -reserved }];
  if (charged > 0) postings.push({ account: SYSTEM.usage, amount: charged });
  if (reserved - charged > 0) postings.push({ account: userAccountCode(input.userId), amount: reserved - charged });
  return postTransaction(db, {
    type: "usage_settle",
    idempotencyKey: `job:${input.jobId}:close`,
    memo: `AI job: charged ${charged}, returned ${reserved - charged}`,
    userId: input.userId,
    ref: input.jobId,
    postings,
  });
}

/** Job failed (or never finished): the full reservation goes back. */
export function releaseHold(
  db: DbOrTx,
  input: { userId: string; jobId: string; reserved: number; reason: string },
) {
  return postTransaction(db, {
    type: "usage_release",
    // Same key as settleHold: a job is closed exactly once, either way.
    idempotencyKey: `job:${input.jobId}:close`,
    memo: `Refunded: ${input.reason}`,
    userId: input.userId,
    ref: input.jobId,
    postings: [
      { account: SYSTEM.holds, amount: -input.reserved },
      { account: userAccountCode(input.userId), amount: input.reserved },
    ],
  });
}

/** Admin correction. Negative deltas cannot overdraw the wallet. */
export function adjustCredits(
  db: DbOrTx,
  input: { userId: string; actorId: string; delta: number; reason: string; key: string },
) {
  return postTransaction(db, {
    type: "manual_adjustment",
    idempotencyKey: `adjust:${input.key}`,
    memo: input.reason,
    userId: input.userId,
    actorId: input.actorId,
    postings: [
      { account: SYSTEM.adjustments, amount: -input.delta },
      { account: userAccountCode(input.userId), amount: input.delta },
    ],
  });
}

/**
 * Take back credits for refunded money, but never more than the user still
 * has (credits already spent stay spent). Returns how many were reclaimed.
 */
export async function clawbackCredits(
  db: DbOrTx,
  input: { userId: string; refundKey: string; credits: number; memo: string; actorId?: string | null },
): Promise<number> {
  return db.transaction(async (tx) => {
    await lockUserAccounts(tx, [userAccountCode(input.userId)]);
    const amount = Math.min(input.credits, await getUserBalance(tx, input.userId));
    if (amount <= 0) return 0;
    const result = await postTransaction(tx, {
      type: "refund_clawback",
      idempotencyKey: `refund:${input.refundKey}:clawback`,
      memo: input.memo,
      userId: input.userId,
      actorId: input.actorId ?? null,
      ref: input.refundKey,
      postings: [
        { account: userAccountCode(input.userId), amount: -amount },
        { account: SYSTEM.sales, amount },
      ],
    });
    return result.duplicate ? 0 : amount;
  });
}
