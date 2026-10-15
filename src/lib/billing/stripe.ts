import Stripe from "stripe";

/**
 * With STRIPE_API_BASE set (e.g. http://localhost:12141) every API call goes
 * to stripe-mock, Stripe's official API mock. Checkout and the Customer
 * Portal are hosted pages that stripe-mock cannot render, so in that mode
 * the app swaps them for a local test simulator that sends real, signed
 * webhook events to /api/stripe/webhook.
 */
export const isStripeMock = () => Boolean(process.env.STRIPE_API_BASE);

let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!key.startsWith("sk_test_")) throw new Error("Only Stripe test-mode keys (sk_test_...) are allowed");
  const base = process.env.STRIPE_API_BASE;
  if (base) {
    const url = new URL(base);
    client = new Stripe(key, {
      host: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      protocol: url.protocol === "https:" ? "https" : "http",
      telemetry: false,
      maxNetworkRetries: 1,
    });
  } else {
    client = new Stripe(key, { maxNetworkRetries: 2 });
  }
  return client;
}

export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}
