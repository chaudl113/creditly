import { PricingCards } from "@/components/pricing-cards";
import { SiteHeader } from "@/components/site-header";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { activeSubscription } from "@/lib/billing/checkout";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const user = await getCurrentUser();
  const sub = user ? await activeSubscription(getDb(), user.id) : undefined;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, usage-based pricing</h1>
          <p className="mt-3 text-slate-600">
            One credit covers about 1,000 tokens of AI work. A typical article summary costs 2–4 credits.
          </p>
        </div>
        <PricingCards signedIn={Boolean(user)} currentPlan={user ? (sub ? "pro" : "free") : undefined} />
        <p className="mt-8 text-center text-xs text-slate-500">
          Payments run in Stripe test mode. Use card 4242 4242 4242 4242 with any future date.
        </p>
      </main>
    </>
  );
}
