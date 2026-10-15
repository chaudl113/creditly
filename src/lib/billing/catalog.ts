/**
 * Product catalog. Prices are in cents. In Stripe test mode with real keys,
 * set STRIPE_PRICE_* to your price ids; with stripe-mock, inline price_data
 * is used instead.
 */
export const SIGNUP_CREDITS = 50;

export const PLANS = {
  free: { key: "free", name: "Free", priceCents: 0, monthlyCredits: 0 },
  pro: { key: "pro", name: "Pro", priceCents: 1900, monthlyCredits: 1000 },
} as const;
export type PlanKey = keyof typeof PLANS;

export const PACKS = {
  pack_500: { key: "pack_500", name: "500 credit pack", priceCents: 900, credits: 500 },
} as const;
export type PackKey = keyof typeof PACKS;

export const formatUsd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
