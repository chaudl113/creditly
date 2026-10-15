import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { PACKS, PLANS, type PackKey } from "./catalog";
import { getStripe } from "./stripe";

/**
 * Test-mode stand-in for Stripe's hosted Checkout and Customer Portal when the
 * app runs against stripe-mock. It produces the same event shapes Stripe
 * sends and delivers them, signed, to the real webhook endpoint — so the
 * production code path (signature check included) is what gets exercised.
 */

const rid = (prefix: string) => `${prefix}_sim_${randomBytes(9).toString("hex")}`;
const nowSec = () => Math.floor(Date.now() / 1000);

export function buildEvent<T extends Stripe.Event["type"]>(
  type: T,
  object: Record<string, unknown>,
  created = nowSec(),
): Stripe.Event {
  return {
    id: rid("evt"),
    object: "event",
    api_version: "2026-09-30.endive",
    created,
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  } as unknown as Stripe.Event;
}

export function signPayload(payload: string, secret: string): string {
  return getStripe().webhooks.generateTestHeaderString({ payload, secret });
}

export type SimCheckout = { id: string; userId: string; customer: string; kind: "subscription" | "credit_pack"; productKey: string };

/** Events Stripe sends when a test card payment succeeds. */
export function checkoutSucceededEvents(s: SimCheckout, created = nowSec()): Stripe.Event[] {
  if (s.kind === "credit_pack") {
    const pack = PACKS[s.productKey as PackKey];
    return [
      buildEvent(
        "checkout.session.completed",
        {
          id: s.id,
          object: "checkout.session",
          mode: "payment",
          payment_status: "paid",
          status: "complete",
          customer: s.customer,
          client_reference_id: s.userId,
          payment_intent: rid("pi"),
          amount_total: pack.priceCents,
          currency: "usd",
          metadata: { userId: s.userId, kind: s.kind, product: s.productKey },
        },
        created,
      ),
    ];
  }
  const subscriptionId = rid("sub");
  return [
    buildEvent(
      "checkout.session.completed",
      {
        id: s.id,
        object: "checkout.session",
        mode: "subscription",
        payment_status: "paid",
        status: "complete",
        customer: s.customer,
        client_reference_id: s.userId,
        subscription: subscriptionId,
        amount_total: PLANS.pro.priceCents,
        currency: "usd",
        metadata: { userId: s.userId, kind: s.kind, product: s.productKey },
      },
      created,
    ),
    subscriptionEvent("customer.subscription.created", {
      id: subscriptionId,
      customer: s.customer,
      userId: s.userId,
      status: "active",
      cancelAtPeriodEnd: false,
      created,
    }),
    invoicePaidEvent({ subscriptionId, customer: s.customer, userId: s.userId, created }),
  ];
}

export function subscriptionEvent(
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  s: { id: string; customer: string; userId: string; status: string; cancelAtPeriodEnd: boolean; created?: number },
): Stripe.Event {
  const created = s.created ?? nowSec();
  return buildEvent(
    type,
    {
      id: s.id,
      object: "subscription",
      customer: s.customer,
      status: s.status,
      cancel_at_period_end: s.cancelAtPeriodEnd,
      metadata: { userId: s.userId, plan: "pro" },
      items: {
        object: "list",
        data: [
          {
            id: rid("si"),
            object: "subscription_item",
            current_period_end: created + 30 * 24 * 3600,
            price: { id: "price_sim_pro", object: "price", unit_amount: PLANS.pro.priceCents, recurring: { interval: "month" } },
          },
        ],
      },
    },
    created,
  );
}

export function invoicePaidEvent(i: { subscriptionId: string; customer: string; userId: string; created?: number }) {
  return buildEvent(
    "invoice.paid",
    {
      id: rid("in"),
      object: "invoice",
      customer: i.customer,
      amount_paid: PLANS.pro.priceCents,
      currency: "usd",
      status: "paid",
      billing_reason: "subscription_cycle",
      payment_intent: rid("pi"),
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: i.subscriptionId, metadata: { userId: i.userId, plan: "pro" } },
      },
    },
    i.created,
  );
}

export function chargeRefundedEvent(c: { paymentIntentId: string; amountRefunded: number; amount: number; created?: number }) {
  return buildEvent(
    "charge.refunded",
    {
      id: rid("ch"),
      object: "charge",
      payment_intent: c.paymentIntentId,
      amount: c.amount,
      amount_refunded: c.amountRefunded,
      refunded: c.amountRefunded >= c.amount,
      currency: "usd",
    },
    c.created,
  );
}

/** POSTs events, signed, to our own webhook endpoint (as Stripe would). */
export async function deliver(events: Stripe.Event[], opts: { endpoint: string; secret: string }) {
  const results: { id: string; type: string; status: number }[] = [];
  for (const event of events) {
    const payload = JSON.stringify(event);
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signPayload(payload, opts.secret) },
      body: payload,
    });
    results.push({ id: event.id, type: event.type, status: res.status });
  }
  return results;
}

/**
 * Real networks deliver late, twice, and out of order. This reorders the
 * events (newest first) and sends each one twice.
 */
export function flaky(events: Stripe.Event[]): Stripe.Event[] {
  const reversed = [...events].reverse();
  return [...reversed, ...events];
}
