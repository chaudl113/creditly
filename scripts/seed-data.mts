/**
 * Demo data shared by `npm run seed` and `npm run demo:reset`: an admin
 * account plus clearly labelled demo users. Purchases are not inserted
 * directly: simulated Stripe events go through the same `processEvent`
 * pipeline as real webhooks, so the ledger, payments and subscriptions are
 * exactly what production code would have produced.
 */
import { eq, like } from "drizzle-orm";
import type { Db } from "../src/db/index.ts";
import { users } from "../src/db/schema.ts";
import { adminAdjustCredits, adminRefund } from "../src/lib/admin/service.ts";
import { DemoProvider } from "../src/lib/ai/demo.ts";
import { runSummarize } from "../src/lib/ai/jobs.ts";
import { checkoutSucceededEvents, invoicePaidEvent, subscriptionEvent } from "../src/lib/billing/simulator.ts";
import { getStripe } from "../src/lib/billing/stripe.ts";
import { processEvent } from "../src/lib/billing/webhooks.ts";
import { paymentsWithRefunds } from "../src/lib/billing/queries.ts";
import { ADMIN_EMAIL, DEMO_DOMAIN } from "../src/lib/demo.ts";
import { createUser } from "../src/lib/users.ts";

const DAY = 86_400;

const SAMPLES = [
  `Demo data. Harbor Logistics shipped 12,400 containers in September, 8% more than in August. Average dwell time fell from 4.1 to 3.6 days after the new yard system went live on September 9. Fuel costs rose 5% to $2.3 million. The company plans to add two cranes by January 2027 at a cost of $18 million.`,
  `Demo data. The city council approved a $64 million budget for 2027 on October 2. Spending on public transport increases by 12% to $9.8 million, while road maintenance stays flat at $7.1 million. A new bike-share scheme with 600 bikes will launch in April. Property tax rises 1.5%.`,
  `Demo data. Product review meeting, October 8. Weekly active users reached 18,200, up 6%. Churn on the Starter plan was 3.1%, compared with 2.4% on Team. The mobile release slips to November 4 because of the payments SDK upgrade. Marketing will test a $9 annual discount in two regions.`,
];

const DEMO_USERS = [
  { name: "Ava Patel", plan: "pro", packs: 1 },
  { name: "Ben Okafor", plan: "pro", packs: 0 },
  { name: "Chloe Martin", plan: "free", packs: 2 },
  { name: "Diego Alvarez", plan: "pro", packs: 2 },
  { name: "Emma Johansson", plan: "free", packs: 1 },
  { name: "Farah Haddad", plan: "free", packs: 0 },
  { name: "George Kim", plan: "pro", packs: 1 },
  { name: "Hana Sato", plan: "free", packs: 1 },
] as const;

/** Creates the admin (if missing) and the demo users. Skips if demo users already exist. */
export async function seedDemo(db: Db, log: (msg: string) => void = console.log) {
  // Small deterministic PRNG so every seed run looks the same.
  let state = 42;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const now = Math.floor(Date.now() / 1000);
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  let [admin] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
  if (!admin) {
    if (!adminPassword) throw new Error("SEED_ADMIN_PASSWORD is not set");
    admin = await createUser(db, { email: ADMIN_EMAIL, name: "Admin (demo)", password: adminPassword, role: "admin" });
    log(`created ${ADMIN_EMAIL}`);
  }

  const existing = await db.select({ id: users.id }).from(users).where(like(users.email, `%@${DEMO_DOMAIN}`)).limit(1);
  if (existing.length) {
    log("demo data already present, skipping");
    return;
  }

  const provider = new DemoProvider();
  for (const [i, spec] of DEMO_USERS.entries()) {
    const email = `${spec.name.split(" ")[0].toLowerCase()}@${DEMO_DOMAIN}`;
    const joined = now - Math.floor((5 + rand() * 24) * DAY);
    const user = await createUser(db, { email, name: `${spec.name} (Demo data)`, password: "demo-password" });
    await db.update(users).set({ createdAt: new Date(joined * 1000) }).where(eq(users.id, user.id));
    const customer = `cus_demo_${i}`;
    await db.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, user.id));

    if (spec.plan === "pro") {
      const at = joined + Math.floor(rand() * 2 * DAY);
      const events = checkoutSucceededEvents(
        { id: `cs_demo_${i}_pro`, userId: user.id, customer, kind: "subscription", productKey: "pro" },
        at,
      );
      for (const e of events) await processEvent(db, e);
      if (i === 1) {
        // One subscriber has already cancelled at period end.
        const sub = events.find((e) => e.type === "customer.subscription.created")!.data.object as { id: string };
        await processEvent(
          db,
          subscriptionEvent("customer.subscription.updated", {
            id: sub.id, customer, userId: user.id, status: "active", cancelAtPeriodEnd: true, created: at + DAY,
          }),
        );
      }
      if (now - at > 28 * DAY) {
        const sub = events.find((e) => e.type === "customer.subscription.created")!.data.object as { id: string };
        await processEvent(db, invoicePaidEvent({ subscriptionId: sub.id, customer, userId: user.id, created: at + 30 * DAY }));
      }
    }
    for (let p = 0; p < spec.packs; p++) {
      const at = joined + Math.floor((1 + rand() * ((now - joined) / DAY - 1)) * DAY);
      const [event] = checkoutSucceededEvents(
        { id: `cs_demo_${i}_pack_${p}`, userId: user.id, customer, kind: "credit_pack", productKey: "pack_500" },
        at,
      );
      await processEvent(db, event);
    }
    const runs = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < runs; r++) {
      const at = new Date((now - Math.floor(rand() * 4 * DAY)) * 1000);
      await runSummarize(db, user.id, { kind: "text", text: SAMPLES[(i + r) % SAMPLES.length] }, provider, at);
    }
    if (i === 4) {
      await runSummarize(db, user.id, { kind: "text", text: `${SAMPLES[0]} [fail]` }, provider, new Date());
    }
    log(`seeded ${email}`);
  }

  const [chloe] = await db.select().from(users).where(eq(users.email, `chloe@${DEMO_DOMAIN}`));
  await adminAdjustCredits(db, admin.id, {
    userId: chloe.id,
    delta: 120,
    reason: "Demo data: compensation for a slow summary during the Oct 3 incident",
    requestId: "seed-adjust-1",
  });

  // Refund one pack through the configured Stripe (stripe-mock in docker compose).
  const [hana] = await db.select().from(users).where(eq(users.email, `hana@${DEMO_DOMAIN}`));
  const [payment] = await paymentsWithRefunds(db, { userId: hana.id, limit: 1 });
  try {
    await adminRefund(
      db,
      admin.id,
      { paymentId: payment.id, amountCents: 450, reason: "Demo data: partial refund, customer bought by mistake", requestId: "seed-refund-1" },
      getStripe(),
    );
  } catch (e) {
    console.warn(`skipped demo refund (${(e as Error).message})`);
  }
  log("demo data seeded");
}

