import { and, eq, inArray, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db } from "@/db";
import { checkoutSessions, subscriptions, users, type User } from "@/db/schema";
import { appUrl } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { PACKS, PLANS, type PackKey } from "./catalog";
import { getStripe, isStripeMock } from "./stripe";

export const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];

export async function activeSubscription(db: Db, userId: string) {
  return db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, userId), inArray(subscriptions.status, LIVE_SUBSCRIPTION_STATUSES)),
  });
}

/** Creates the Stripe customer once and remembers it on the user. */
export async function ensureStripeCustomer(db: Db, user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await getStripe().customers.create(
    { email: user.email, name: user.name, metadata: { userId: user.id } },
    { idempotencyKey: `customer:${user.id}` },
  );
  const [updated] = await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(users.id, user.id), isNull(users.stripeCustomerId)))
    .returning();
  if (updated) return customer.id;
  // Lost a race with a parallel request: use the id that was stored first.
  const current = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  return current!.stripeCustomerId!;
}

export type CheckoutRequest = { kind: "subscription"; plan: "pro" } | { kind: "credit_pack"; pack: PackKey };

export async function createCheckout(db: Db, user: User, req: CheckoutRequest): Promise<string> {
  const customer = await ensureStripeCustomer(db, user);
  const metadata = { userId: user.id, kind: req.kind, product: req.kind === "subscription" ? req.plan : req.pack };
  const base = appUrl();
  let params: Stripe.Checkout.SessionCreateParams;
  let amountCents: number;

  if (req.kind === "subscription") {
    if (await activeSubscription(db, user.id)) {
      throw new AppError("VALIDATION", "You already have an active subscription. Manage it from Billing.");
    }
    const plan = PLANS[req.plan];
    amountCents = plan.priceCents;
    const price = process.env.STRIPE_PRICE_PRO;
    params = {
      mode: "subscription",
      line_items: [
        price
          ? { price, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: plan.priceCents,
                recurring: { interval: "month" },
                product_data: { name: `Creditly ${plan.name}` },
              },
            },
      ],
      subscription_data: { metadata: { userId: user.id, plan: plan.key } },
    };
  } else {
    const pack = PACKS[req.pack];
    amountCents = pack.priceCents;
    const price = process.env.STRIPE_PRICE_PACK_500;
    params = {
      mode: "payment",
      line_items: [
        price
          ? { price, quantity: 1 }
          : {
              quantity: 1,
              price_data: { currency: "usd", unit_amount: pack.priceCents, product_data: { name: pack.name } },
            },
      ],
    };
  }

  const session = await getStripe().checkout.sessions.create({
    ...params,
    customer,
    client_reference_id: user.id,
    metadata,
    success_url: `${base}/app/billing?checkout=success`,
    cancel_url: `${base}/app/billing?checkout=cancelled`,
  });

  await db.insert(checkoutSessions).values({
    id: session.id,
    userId: user.id,
    kind: req.kind,
    productKey: metadata.product,
    amountCents,
  });

  if (isStripeMock()) return `${base}/billing/test-checkout/${session.id}`;
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalUrl(db: Db, user: User): Promise<string> {
  const customer = await ensureStripeCustomer(db, user);
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${appUrl()}/app/billing`,
  });
  return isStripeMock() ? `${appUrl()}/billing/test-portal` : session.url;
}
