import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db, Tx } from "@/db";
import { checkoutSessions, payments, refunds, stripeEvents, subscriptions, users } from "@/db/schema";
import { clawbackCredits, creditPurchase, grantPlanCredits } from "@/lib/credits";
import { PACKS, PLANS, type PackKey, type PlanKey } from "./catalog";
import { getStripe } from "./stripe";

/**
 * Webhook pipeline
 *
 *   verify signature → record event (id is unique) → lock the event row →
 *   skip if already handled → apply inside ONE transaction → mark processed
 *
 * - Duplicates (Stripe retries, replays, concurrent deliveries) are no-ops:
 *   the event row is locked FOR UPDATE and checked, and every ledger posting
 *   also carries its own natural idempotency key.
 * - Out-of-order delivery: subscription state only moves forward in
 *   Stripe-time (`event.created`); a refund that arrives before its payment
 *   fails with a retryable error, so Stripe redelivers it later.
 */

export class RetryLater extends Error {
  name = "RetryLater";
}

export type WebhookOutcome =
  | { status: "processed" | "ignored"; note?: string }
  | { status: "duplicate" }
  | { status: "failed"; error: string };

export function verifyWebhook(rawBody: string, signature: string | null, secret: string): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

export async function processEvent(db: Db, event: Stripe.Event): Promise<WebhookOutcome> {
  const inserted = await db
    .insert(stripeEvents)
    .values({
      id: event.id,
      type: event.type,
      stripeCreatedAt: new Date(event.created * 1000),
      payload: event,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: stripeEvents.id,
      set: { deliveries: sql`${stripeEvents.deliveries} + 1` },
    })
    .returning({ status: stripeEvents.status });
  if (inserted[0]?.status === "processed" || inserted[0]?.status === "ignored") return { status: "duplicate" };

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: stripeEvents.status })
        .from(stripeEvents)
        .where(eq(stripeEvents.id, event.id))
        .for("update");
      // A concurrent delivery may have finished while we waited for the lock.
      if (row.status === "processed" || row.status === "ignored") return { status: "duplicate" } as const;

      const result = await applyEvent(tx, event);
      await tx
        .update(stripeEvents)
        .set({
          status: result.status,
          note: result.note ?? null,
          lastError: null,
          attempts: sql`${stripeEvents.attempts} + 1`,
          processedAt: new Date(),
        })
        .where(eq(stripeEvents.id, event.id));
      return result;
    });
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await db
      .update(stripeEvents)
      .set({ status: "failed", lastError: error, attempts: sql`${stripeEvents.attempts} + 1` })
      .where(eq(stripeEvents.id, event.id));
    return { status: "failed", error };
  }
}

type Applied = { status: "processed" | "ignored"; note?: string };

async function applyEvent(tx: Tx, event: Stripe.Event): Promise<Applied> {
  const at = new Date(event.created * 1000);
  switch (event.type) {
    case "checkout.session.completed":
      return onCheckoutCompleted(tx, event.data.object, at);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return onSubscriptionChanged(tx, event.data.object, at, event.type.endsWith("deleted"));
    case "invoice.paid":
      return onInvoicePaid(tx, event.data.object, at);
    case "charge.refunded":
      return onChargeRefunded(tx, event.data.object);
    default:
      return { status: "ignored", note: `No handler for ${event.type}` };
  }
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

async function userIdForCustomer(tx: Tx, customer: string | null, fallback?: string | null) {
  if (fallback) return fallback;
  if (!customer) return null;
  const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customer));
  return u?.id ?? null;
}

async function onCheckoutCompleted(tx: Tx, session: Stripe.Checkout.Session, at: Date): Promise<Applied> {
  const [local] = await tx.select().from(checkoutSessions).where(eq(checkoutSessions.id, session.id));
  const userId = local?.userId ?? session.metadata?.userId ?? session.client_reference_id;
  if (!userId) return { status: "ignored", note: "Checkout session not created by this app" };
  if (local) {
    await tx
      .update(checkoutSessions)
      .set({ status: "completed", completedAt: at })
      .where(eq(checkoutSessions.id, session.id));
  }

  if (session.mode === "payment") {
    if (session.payment_status !== "paid") return { status: "ignored", note: "Payment not settled yet" };
    const packKey = (local?.productKey ?? session.metadata?.product) as PackKey;
    const pack = PACKS[packKey];
    if (!pack) throw new Error(`Unknown credit pack ${packKey}`);
    const [payment] = await tx
      .insert(payments)
      .values({
        stripeRef: session.id,
        paymentIntentId: idOf(session.payment_intent),
        userId,
        kind: "credit_pack",
        productKey: pack.key,
        amountCents: session.amount_total ?? pack.priceCents,
        currency: session.currency ?? "usd",
        creditsGranted: pack.credits,
        paidAt: at,
      })
      .onConflictDoNothing({ target: payments.stripeRef })
      .returning({ id: payments.id });
    await creditPurchase(tx, { userId, paymentRef: session.id, credits: pack.credits, packName: pack.name });
    return { status: "processed", note: payment ? `+${pack.credits} credits` : "Payment already recorded" };
  }

  // Subscription checkout: the subscription/invoice events carry the state and
  // the credits. Recording the link here means it works whichever comes first.
  const subscriptionId = idOf(session.subscription);
  if (subscriptionId) {
    await upsertSubscription(tx, {
      id: subscriptionId,
      userId,
      planKey: "pro",
      status: "active",
      priceCents: session.amount_total ?? PLANS.pro.priceCents,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeEventAt: at,
    });
  }
  return { status: "processed", note: `Subscription ${subscriptionId} started` };
}

async function upsertSubscription(tx: Tx, row: typeof subscriptions.$inferInsert) {
  // Only apply state that is at least as new as what we already have.
  await tx
    .insert(subscriptions)
    .values(row)
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        status: sql`excluded.status`,
        planKey: sql`excluded.plan_key`,
        priceCents: sql`excluded.price_cents`,
        currentPeriodEnd: sql`COALESCE(excluded.current_period_end, ${subscriptions.currentPeriodEnd})`,
        cancelAtPeriodEnd: sql`excluded.cancel_at_period_end`,
        stripeEventAt: sql`excluded.stripe_event_at`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${subscriptions.stripeEventAt} <= excluded.stripe_event_at`,
    });
}

async function onSubscriptionChanged(
  tx: Tx,
  sub: Stripe.Subscription,
  at: Date,
  deleted: boolean,
): Promise<Applied> {
  const userId = await userIdForCustomer(tx, idOf(sub.customer), sub.metadata?.userId);
  if (!userId) throw new RetryLater(`No user for customer ${idOf(sub.customer)} yet`);
  const item = sub.items?.data?.[0];
  const planKey = (sub.metadata?.plan as PlanKey) ?? "pro";
  const [before] = await tx.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
  await upsertSubscription(tx, {
    id: sub.id,
    userId,
    planKey,
    status: deleted ? "canceled" : sub.status,
    priceCents: item?.price?.unit_amount ?? PLANS[planKey]?.priceCents ?? PLANS.pro.priceCents,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    stripeEventAt: at,
  });
  if (before && before.stripeEventAt > at) {
    return { status: "processed", note: "Stale event: newer subscription state already applied" };
  }
  return { status: "processed", note: `Subscription ${deleted ? "canceled" : sub.status}` };
}

async function onInvoicePaid(tx: Tx, invoice: Stripe.Invoice, at: Date): Promise<Applied> {
  const details = invoice.parent?.subscription_details;
  const subscriptionId = idOf(details?.subscription);
  if (!subscriptionId) return { status: "ignored", note: "Not a subscription invoice" };
  const userId = await userIdForCustomer(tx, idOf(invoice.customer), details?.metadata?.userId);
  if (!userId) throw new RetryLater(`No user for customer ${idOf(invoice.customer)} yet`);
  const plan = PLANS[(details?.metadata?.plan as PlanKey) ?? "pro"] ?? PLANS.pro;
  const legacyPi = (invoice as unknown as { payment_intent?: string | null }).payment_intent ?? null;

  await tx
    .insert(payments)
    .values({
      stripeRef: invoice.id!,
      paymentIntentId: legacyPi,
      userId,
      kind: "subscription",
      productKey: plan.key,
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      creditsGranted: plan.monthlyCredits,
      paidAt: at,
    })
    .onConflictDoNothing({ target: payments.stripeRef });
  await grantPlanCredits(tx, {
    userId,
    invoiceId: invoice.id!,
    credits: plan.monthlyCredits,
    planName: plan.name,
  });
  return { status: "processed", note: `+${plan.monthlyCredits} credits for ${invoice.id}` };
}

/**
 * `amount_refunded` is cumulative, so we record only the part not seen yet.
 * Refunds issued from our admin panel are already recorded and net to zero.
 */
async function onChargeRefunded(tx: Tx, charge: Stripe.Charge): Promise<Applied> {
  const pi = idOf(charge.payment_intent);
  if (!pi) return { status: "ignored", note: "Charge without payment intent" };
  const [payment] = await tx.select().from(payments).where(eq(payments.paymentIntentId, pi)).for("update");
  if (!payment) throw new RetryLater(`Payment for ${pi} not recorded yet`);
  return recordRefund(tx, {
    payment,
    refundId: `charge:${charge.id}:${charge.amount_refunded}`,
    cumulativeRefundedCents: charge.amount_refunded,
    reason: "Refunded in Stripe",
    actorId: null,
  });
}

/** Shared by the webhook and the admin refund action. Caller holds the payment row lock. */
export async function recordRefund(
  tx: Tx,
  input: {
    payment: typeof payments.$inferSelect;
    refundId: string;
    cumulativeRefundedCents: number;
    reason: string;
    actorId: string | null;
  },
): Promise<Applied> {
  const { payment } = input;
  const [{ already }] = await tx
    .select({ already: sql<string>`COALESCE(SUM(${refunds.amountCents}), 0)` })
    .from(refunds)
    .where(eq(refunds.paymentId, payment.id));
  const delta = Math.min(input.cumulativeRefundedCents, payment.amountCents) - Number(already);
  if (delta <= 0) return { status: "processed", note: "Refund already recorded" };

  const credits = Math.round((payment.creditsGranted * delta) / payment.amountCents);
  const reclaimed = await clawbackCredits(tx, {
    userId: payment.userId,
    refundKey: input.refundId,
    credits,
    memo: `${input.reason} (${(delta / 100).toFixed(2)} ${payment.currency.toUpperCase()})`,
    actorId: input.actorId,
  });
  await tx.insert(refunds).values({
    id: input.refundId,
    paymentId: payment.id,
    amountCents: delta,
    creditsReclaimed: reclaimed,
    reason: input.reason,
    actorId: input.actorId,
  });
  return { status: "processed", note: `Refund of ${delta} cents, ${reclaimed} credits reclaimed` };
}
