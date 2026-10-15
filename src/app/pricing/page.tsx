import { PricingCards } from "@/components/pricing-cards";
import { SiteHeader } from "@/components/site-header";
import { getDb } from "@/db";
import { INPUT_TOKENS_PER_CREDIT, OUTPUT_TOKENS_PER_CREDIT } from "@/lib/ai/pricing";
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
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple, usage-based pricing</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            One credit buys {INPUT_TOKENS_PER_CREDIT.toLocaleString("en-US")} input tokens or{" "}
            {OUTPUT_TOKENS_PER_CREDIT} output tokens. A typical article summary costs 3–8 credits, and you only pay
            for tokens actually used.
          </p>
        </div>
        <PricingCards signedIn={Boolean(user)} currentPlan={user ? (sub ? "pro" : "free") : undefined} />
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Payments run in Stripe test mode. Use card 4242 4242 4242 4242 with any future date.
        </p>
      </main>
    </>
  );
}
