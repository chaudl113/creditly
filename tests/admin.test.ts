import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, ledgerTransactions, payments, refunds, users } from "@/db/schema";
import { listUsers, overview } from "@/lib/admin/queries";
import { adminAdjustCredits, adminRefund } from "@/lib/admin/service";
import { SIGNUP_CREDITS } from "@/lib/billing/catalog";
import { chargeRefundedEvent, checkoutSucceededEvents } from "@/lib/billing/simulator";
import { processEvent } from "@/lib/billing/webhooks";
import { getUserBalance, trialBalance } from "@/lib/ledger";
import { dbError, makeUser, resetDb, testDb } from "./helpers";

const db = testDb();
beforeEach(() => resetDb());

/** Stand-in for Stripe's refunds API that honours idempotency keys like Stripe does. */
function fakeStripe() {
  const byKey = new Map<string, { id: string }>();
  const calls: Stripe.RefundCreateParams[] = [];
  const api = {
    refunds: {
      create: async (params: Stripe.RefundCreateParams, opts?: Stripe.RequestOptions) => {
        calls.push(params);
        const key = opts?.idempotencyKey ?? crypto.randomUUID();
        if (!byKey.has(key)) byKey.set(key, { id: `re_test_${byKey.size + 1}` });
        return byKey.get(key)!;
      },
    },
  } as unknown as Pick<Stripe, "refunds">;
  return { api, calls };
}

async function userWithPackPayment() {
  const user = await makeUser();
  const [event] = checkoutSucceededEvents({
    id: `cs_test_${crypto.randomUUID()}`,
    userId: user.id,
    customer: "cus_test",
    kind: "credit_pack",
    productKey: "pack_500",
  });
  await processEvent(db, event);
  const [payment] = await db.select().from(payments).where(eq(payments.userId, user.id));
  return { user, payment };
}

const audits = () => db.select().from(auditLog);

describe("admin authorization", () => {
  it("rejects credit adjustments by non-admins and writes nothing", async () => {
    const user = await makeUser();
    const target = await makeUser();
    await expect(
      adminAdjustCredits(db, user.id, { userId: target.id, delta: 1000, reason: "free money", requestId: "r1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getUserBalance(db, target.id)).toBe(SIGNUP_CREDITS);
    expect(await audits()).toHaveLength(0);
  });

  it("rejects refunds by non-admins before Stripe is called", async () => {
    const { user, payment } = await userWithPackPayment();
    const stripe = fakeStripe();
    await expect(
      adminRefund(db, user.id, { paymentId: payment.id, amountCents: 900, reason: "refund myself", requestId: "r1" }, stripe.api),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(stripe.calls).toHaveLength(0);
    expect(await db.select().from(refunds)).toHaveLength(0);
  });

  it("a demoted admin loses access immediately (role is read from the database)", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser();
    await adminAdjustCredits(db, admin.id, { userId: target.id, delta: 5, reason: "goodwill", requestId: "a" });
    await db.update(users).set({ role: "user" }).where(eq(users.id, admin.id));
    await expect(
      adminAdjustCredits(db, admin.id, { userId: target.id, delta: 5, reason: "goodwill", requestId: "b" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("manual credit adjustments", () => {
  it("posts a balanced adjustment and an audit entry with the reason", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser();
    await adminAdjustCredits(db, admin.id, { userId: target.id, delta: 250, reason: "  Outage compensation ", requestId: "r1" });
    expect(await getUserBalance(db, target.id)).toBe(SIGNUP_CREDITS + 250);
    expect((await trialBalance(db)).total).toBe(0);
    const [entry] = await audits();
    expect(entry).toMatchObject({
      actorId: admin.id,
      action: "credits.adjust",
      targetUserId: target.id,
      reason: "Outage compensation",
      details: { delta: 250 },
    });
    const [tx] = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.type, "manual_adjustment"));
    expect(tx).toMatchObject({ actorId: admin.id, memo: "Outage compensation", id: entry.targetRef });
  });

  it("requires a reason and a sane non-zero amount", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser();
    for (const [delta, reason] of [[10, ""], [10, "  x "], [0, "valid reason"], [1.5, "valid reason"], [1e9, "valid reason"]] as const) {
      await expect(
        adminAdjustCredits(db, admin.id, { userId: target.id, delta, reason, requestId: crypto.randomUUID() }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    }
    expect(await audits()).toHaveLength(0);
  });

  it("cannot overdraw a wallet, and leaves no audit entry when it fails", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser();
    await expect(
      adminAdjustCredits(db, admin.id, { userId: target.id, delta: -(SIGNUP_CREDITS + 1), reason: "abuse", requestId: "r1" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(await getUserBalance(db, target.id)).toBe(SIGNUP_CREDITS);
    expect(await audits()).toHaveLength(0);
  });

  it("a double-submitted form posts once", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser();
    const input = { userId: target.id, delta: 100, reason: "goodwill", requestId: "same-form" };
    await Promise.all([adminAdjustCredits(db, admin.id, input), adminAdjustCredits(db, admin.id, input)]);
    expect(await getUserBalance(db, target.id)).toBe(SIGNUP_CREDITS + 100);
    expect(await audits()).toHaveLength(1);
  });

  it("the audit log is append-only", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser();
    await adminAdjustCredits(db, admin.id, { userId: target.id, delta: 1, reason: "goodwill", requestId: "r" });
    expect(await dbError(db.update(auditLog).set({ reason: "rewritten" }))).toMatch(/append-only/);
    expect(await dbError(db.delete(auditLog))).toMatch(/append-only/);
  });
});

describe("admin refunds", () => {
  it("partial refund reclaims a proportional share of credits and is audited", async () => {
    const admin = await makeUser({ role: "admin" });
    const { user, payment } = await userWithPackPayment();
    const stripe = fakeStripe();
    const res = await adminRefund(
      db,
      admin.id,
      { paymentId: payment.id, amountCents: 450, reason: "Customer request", requestId: "r1" },
      stripe.api,
    );
    expect(stripe.calls[0]).toMatchObject({ payment_intent: payment.paymentIntentId, amount: 450 });
    expect(res.creditsReclaimed).toBe(250);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + 250);
    expect((await trialBalance(db)).total).toBe(0);
    const [entry] = await audits();
    expect(entry).toMatchObject({ action: "payment.refund", targetUserId: user.id, targetRef: res.refundId });
  });

  it("the later charge.refunded webhook does not reclaim twice", async () => {
    const admin = await makeUser({ role: "admin" });
    const { user, payment } = await userWithPackPayment();
    await adminRefund(db, admin.id, { paymentId: payment.id, amountCents: 900, reason: "Duplicate charge", requestId: "r1" }, fakeStripe().api);
    const webhook = chargeRefundedEvent({ paymentIntentId: payment.paymentIntentId!, amount: 900, amountRefunded: 900 });
    expect(await processEvent(db, webhook)).toMatchObject({ status: "processed" });
    expect(await db.select().from(refunds)).toHaveLength(1);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
  });

  it("never refunds more than was paid, and a double submit refunds once", async () => {
    const admin = await makeUser({ role: "admin" });
    const { payment } = await userWithPackPayment();
    const stripe = fakeStripe();
    await expect(
      adminRefund(db, admin.id, { paymentId: payment.id, amountCents: 901, reason: "too much", requestId: "r0" }, stripe.api),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const input = { paymentId: payment.id, amountCents: 300, reason: "Customer request", requestId: "form-1" };
    const results = await Promise.allSettled([
      adminRefund(db, admin.id, input, stripe.api),
      adminRefund(db, admin.id, input, stripe.api),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const rows = await db.select().from(refunds);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(300);
    expect(await audits()).toHaveLength(1);
  });
});

describe("admin reporting", () => {
  it("MRR counts live subscriptions and revenue is net of refunds", async () => {
    const admin = await makeUser({ role: "admin" });
    const { payment } = await userWithPackPayment();
    const sub = await makeUser();
    for (const e of checkoutSucceededEvents({ id: "cs_sub", userId: sub.id, customer: "cus_sub", kind: "subscription", productKey: "pro" })) {
      await processEvent(db, e);
    }
    await adminRefund(db, admin.id, { paymentId: payment.id, amountCents: 300, reason: "Customer request", requestId: "r1" }, fakeStripe().api);
    const o = await overview(db);
    expect(o.mrrCents).toBe(1900);
    expect(o.activeSubscriptions).toBe(1);
    expect(o.revenue30dCents).toBe(900 + 1900 - 300);
    expect(o.revenue).toHaveLength(31);
    expect(o.revenue.at(-1)).toMatchObject({ grossCents: 2800, refundedCents: 300, netCents: 2500 });
    expect(o.ledger.total).toBe(0);

    const rows = await listUsers(db);
    expect(rows.find((r) => r.id === sub.id)).toMatchObject({ plan: "pro", balance: SIGNUP_CREDITS + 1000, paidCents: 1900 });
    expect(rows.find((r) => r.id === payment.userId)).toMatchObject({ plan: null, paidCents: 900 });
  });
});
