"use server";

import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { latestSubscription } from "@/lib/billing/queries";
import {
  checkoutSucceededEvents,
  deliver,
  flaky,
  invoicePaidEvent,
  subscriptionEvent,
} from "@/lib/billing/simulator";
import { isStripeMock, webhookSecret } from "@/lib/billing/stripe";
import { appUrl } from "@/lib/env";

// Test-mode simulator only. Every action is unavailable unless the app is
// wired to stripe-mock, and only acts on the caller's own records.

async function guard() {
  if (!isStripeMock()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Behind a CDN the public URL would loop out and back in; on a server set
// SIMULATOR_WEBHOOK_URL to the app's own address (e.g. http://127.0.0.1:3101/...).
const webhookEndpoint = () => process.env.SIMULATOR_WEBHOOK_URL || `${appUrl()}/api/stripe/webhook`;

const sendSigned = (events: Parameters<typeof deliver>[0]) =>
  deliver(events, { endpoint: webhookEndpoint(), secret: webhookSecret() });

export async function payTestCheckoutAction(form: FormData) {
  const user = await guard();
  const id = String(form.get("id"));
  const [session] = await getDb()
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, id), eq(checkoutSessions.userId, user.id)));
  if (!session || !user.stripeCustomerId) notFound();
  if (session.status === "open") {
    const events = checkoutSucceededEvents({
      id: session.id,
      userId: user.id,
      customer: user.stripeCustomerId,
      kind: session.kind,
      productKey: session.productKey,
    });
    const results = await sendSigned(form.get("flaky") ? flaky(events) : events);
    const failed = results.find((r) => r.status >= 400);
    if (failed) redirect(`/app/billing?error=${encodeURIComponent(`Webhook ${failed.type} returned ${failed.status}`)}`);
  }
  redirect("/app/billing?checkout=success");
}

export async function testPortalAction(form: FormData) {
  const user = await guard();
  const sub = await latestSubscription(getDb(), user.id);
  if (!sub || !user.stripeCustomerId) redirect("/app/billing");
  const base = { id: sub.id, customer: user.stripeCustomerId, userId: user.id };
  const op = String(form.get("op"));
  const event =
    op === "cancel_at_period_end"
      ? subscriptionEvent("customer.subscription.updated", { ...base, status: "active", cancelAtPeriodEnd: true })
      : op === "resume"
        ? subscriptionEvent("customer.subscription.updated", { ...base, status: "active", cancelAtPeriodEnd: false })
        : op === "cancel_now"
          ? subscriptionEvent("customer.subscription.deleted", { ...base, status: "canceled", cancelAtPeriodEnd: false })
          : op === "renew"
            ? invoicePaidEvent({ subscriptionId: sub.id, customer: user.stripeCustomerId, userId: user.id })
            : null;
  if (event) await sendSigned([event]);
  redirect("/billing/test-portal?done=" + op);
}
