import { getDb } from "@/db";
import { webhookSecret } from "@/lib/billing/stripe";
import { processEvent, verifyWebhook } from "@/lib/billing/webhooks";

export async function POST(request: Request) {
  // The signature covers the exact bytes, so read the raw body.
  const body = await request.text();
  let event;
  try {
    event = verifyWebhook(body, request.headers.get("stripe-signature"), webhookSecret());
  } catch (e) {
    return Response.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }
  const outcome = await processEvent(getDb(), event);
  // 500 makes Stripe retry later (e.g. a refund that arrived before its payment).
  return Response.json(outcome, { status: outcome.status === "failed" ? 500 : 200 });
}
