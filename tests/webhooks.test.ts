import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { checkoutSessions, payments, refunds, stripeEvents, subscriptions, users } from "@/db/schema";
import { PACKS, PLANS, SIGNUP_CREDITS } from "@/lib/billing/catalog";
import {
  chargeRefundedEvent,
  checkoutSucceededEvents,
  flaky,
  invoicePaidEvent,
  signPayload,
  subscriptionEvent,
} from "@/lib/billing/simulator";
import { processEvent, verifyWebhook } from "@/lib/billing/webhooks";
import { getUserBalance, trialBalance } from "@/lib/ledger";
import { makeUser, resetDb, testDb } from "./helpers";

const db = testDb();
const SECRET = "whsec_test_secret";
beforeEach(() => resetDb());

async function customerWithCheckout(kind: "subscription" | "credit_pack") {
  const user = await makeUser();
  const customer = `cus_${user.id.slice(0, 8)}`;
  await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, user.id));
  const id = `cs_test_${crypto.randomUUID()}`;
  const productKey = kind === "subscription" ? "pro" : "pack_500";
  await db.insert(checkoutSessions).values({
    id,
    userId: user.id,
    kind,
    productKey,
    amountCents: kind === "subscription" ? PLANS.pro.priceCents : PACKS.pack_500.priceCents,
  });
  return { user, customer, sim: { id, userId: user.id, customer, kind, productKey } };
}

const eventRow = async (id: string) => (await db.select().from(stripeEvents).where(eq(stripeEvents.id, id)))[0];

describe("signature verification", () => {
  it("accepts a correctly signed payload and rejects tampering, wrong secrets and missing headers", () => {
    const [event] = checkoutSucceededEvents({ id: "cs_1", userId: "u", customer: "c", kind: "credit_pack", productKey: "pack_500" });
    const body = JSON.stringify(event);
    const sig = signPayload(body, SECRET);
    expect(verifyWebhook(body, sig, SECRET).id).toBe(event.id);
    expect(() => verifyWebhook(body.replace("pack_500", "pack_999"), sig, SECRET)).toThrow();
    expect(() => verifyWebhook(body, signPayload(body, "whsec_other"), SECRET)).toThrow();
    expect(() => verifyWebhook(body, null, SECRET)).toThrow(/Missing/);
  });
});

describe("credit pack purchase", () => {
  it("grants the pack once, records the payment and closes the checkout", async () => {
    const { user, sim } = await customerWithCheckout("credit_pack");
    const [event] = checkoutSucceededEvents(sim);
    expect(await processEvent(db, event)).toMatchObject({ status: "processed" });
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + 500);
    const [payment] = await db.select().from(payments).where(eq(payments.userId, user.id));
    expect(payment).toMatchObject({ amountCents: 900, creditsGranted: 500, kind: "credit_pack" });
    const [checkout] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, sim.id));
    expect(checkout.status).toBe("completed");
  });

  it("treats redelivery of the same event as a no-op", async () => {
    const { user, sim } = await customerWithCheckout("credit_pack");
    const [event] = checkoutSucceededEvents(sim);
    await processEvent(db, event);
    expect(await processEvent(db, event)).toEqual({ status: "duplicate" });
    expect(await processEvent(db, event)).toEqual({ status: "duplicate" });
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + 500);
    expect(await eventRow(event.id)).toMatchObject({ status: "processed", deliveries: 3, attempts: 1 });
  });

  it("handles 5 concurrent deliveries of one event exactly once", async () => {
    const { user, sim } = await customerWithCheckout("credit_pack");
    const [event] = checkoutSucceededEvents(sim);
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => processEvent(db, event)));
    expect(outcomes.filter((o) => o.status === "processed")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "duplicate")).toHaveLength(4);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + 500);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("even a re-sent event with a NEW event id cannot grant twice (ledger key)", async () => {
    const { user, sim } = await customerWithCheckout("credit_pack");
    const [first] = checkoutSucceededEvents(sim);
    const [second] = checkoutSucceededEvents(sim); // same session, different evt id
    await processEvent(db, first);
    await processEvent(db, second);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + 500);
  });
});

describe("subscriptions", () => {
  it("ends up correct when events arrive reversed and duplicated", async () => {
    const { user, sim } = await customerWithCheckout("subscription");
    for (const event of flaky(checkoutSucceededEvents(sim))) {
      const outcome = await processEvent(db, event);
      expect(outcome.status).not.toBe("failed");
    }
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(sub).toMatchObject({ status: "active", planKey: "pro", priceCents: 1900 });
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + PLANS.pro.monthlyCredits);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("an older 'active' update cannot resurrect a subscription canceled later", async () => {
    const { user, customer } = await customerWithCheckout("subscription");
    const base = { id: "sub_1", customer, userId: user.id, cancelAtPeriodEnd: false };
    const t = Math.floor(Date.now() / 1000);
    const created = subscriptionEvent("customer.subscription.created", { ...base, status: "active", created: t });
    const updated = subscriptionEvent("customer.subscription.updated", { ...base, status: "active", cancelAtPeriodEnd: true, created: t + 10 });
    const deleted = subscriptionEvent("customer.subscription.deleted", { ...base, status: "canceled", created: t + 20 });
    // Delivered newest first.
    for (const e of [deleted, updated, created]) await processEvent(db, e);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, "sub_1"));
    expect(sub.status).toBe("canceled");
    expect(sub.stripeEventAt.getTime()).toBe((t + 20) * 1000);
  });

  it("grants the monthly allowance once per paid invoice (renewals included)", async () => {
    const { user, customer } = await customerWithCheckout("subscription");
    const renewal1 = invoicePaidEvent({ subscriptionId: "sub_1", customer, userId: user.id });
    const renewal2 = invoicePaidEvent({ subscriptionId: "sub_1", customer, userId: user.id });
    await processEvent(db, renewal1);
    await processEvent(db, renewal1);
    await processEvent(db, renewal2);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + 2 * PLANS.pro.monthlyCredits);
  });
});

describe("refunds", () => {
  async function paidPack() {
    const ctx = await customerWithCheckout("credit_pack");
    const [event] = checkoutSucceededEvents(ctx.sim);
    await processEvent(db, event);
    const pi = (event.data.object as Stripe.Checkout.Session).payment_intent as string;
    return { ...ctx, pi };
  }

  it("a refund that arrives before its payment fails, then succeeds on Stripe's retry", async () => {
    const ctx = await customerWithCheckout("credit_pack");
    const [paid] = checkoutSucceededEvents(ctx.sim);
    const pi = (paid.data.object as Stripe.Checkout.Session).payment_intent as string;
    const refund = chargeRefundedEvent({ paymentIntentId: pi, amount: 900, amountRefunded: 900 });

    const early = await processEvent(db, refund);
    expect(early).toMatchObject({ status: "failed" });
    expect(await eventRow(refund.id)).toMatchObject({ status: "failed", attempts: 1 });

    await processEvent(db, paid);
    expect(await getUserBalance(db, ctx.user.id)).toBe(SIGNUP_CREDITS + 500);

    expect(await processEvent(db, refund)).toMatchObject({ status: "processed" });
    expect(await eventRow(refund.id)).toMatchObject({ status: "processed", attempts: 2, lastError: null });
    expect(await getUserBalance(db, ctx.user.id)).toBe(SIGNUP_CREDITS);
    expect((await trialBalance(db)).total).toBe(0);
  });

  it("records cumulative partial refunds without double counting", async () => {
    const { user, pi } = await paidPack();
    await processEvent(db, chargeRefundedEvent({ paymentIntentId: pi, amount: 900, amountRefunded: 450 }));
    await processEvent(db, chargeRefundedEvent({ paymentIntentId: pi, amount: 900, amountRefunded: 900 }));
    // A late copy of the first partial refund changes nothing.
    await processEvent(db, chargeRefundedEvent({ paymentIntentId: pi, amount: 900, amountRefunded: 450 }));
    const rows = await db.select().from(refunds);
    expect(rows.map((r) => r.amountCents).sort()).toEqual([450, 450]);
    expect(rows.reduce((a, r) => a + r.creditsReclaimed, 0)).toBe(500);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
  });
});

describe("unrelated events", () => {
  it("ignores unknown event types and checkouts this app did not create", async () => {
    const [foreign] = checkoutSucceededEvents({ id: "cs_foreign", userId: "", customer: "cus_x", kind: "credit_pack", productKey: "pack_500" });
    (foreign.data.object as { metadata: object; client_reference_id: null }).metadata = {};
    (foreign.data.object as { client_reference_id: null }).client_reference_id = null;
    expect(await processEvent(db, foreign)).toMatchObject({ status: "ignored" });
    const other = { ...foreign, id: "evt_other", type: "customer.created" } as Stripe.Event;
    expect(await processEvent(db, other)).toMatchObject({ status: "ignored" });
  });
});
