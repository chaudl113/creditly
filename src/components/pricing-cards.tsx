import { startCheckoutAction } from "@/app/app/billing/actions";
import { PACKS, PLANS, formatUsd } from "@/lib/billing/catalog";
import { Badge, Button, ButtonLink, Card } from "./ui";

export function PricingCards({ signedIn, currentPlan }: { signedIn: boolean; currentPlan?: "free" | "pro" }) {
  const cta = (product: string, label: string, variant: "primary" | "secondary" = "primary") =>
    signedIn ? (
      <form action={startCheckoutAction}>
        <input type="hidden" name="product" value={product} />
        <Button type="submit" variant={variant} className="w-full" data-testid={`buy-${product}`}>
          {label}
        </Button>
      </form>
    ) : (
      <ButtonLink href="/signup" variant={variant} className="w-full">
        {label}
      </ButtonLink>
    );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold">{PLANS.free.name}</h3>
          <p className="mt-2 text-3xl font-bold">$0</p>
        </div>
        <ul className="flex-1 space-y-1.5 text-sm text-slate-600">
          <li>✓ 50 welcome credits</li>
          <li>✓ Summaries up to 20,000 characters</li>
          <li>✓ Failed runs refunded</li>
        </ul>
        {currentPlan ? (
          <p className="text-center text-sm text-slate-500">{currentPlan === "free" ? "Your current plan" : "Included"}</p>
        ) : (
          <ButtonLink href="/signup" variant="secondary" className="w-full">Start free</ButtonLink>
        )}
      </Card>
      <Card className="flex flex-col gap-4 ring-2 ring-brand-500">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{PLANS.pro.name}</h3>
            <Badge tone="brand">Most popular</Badge>
          </div>
          <p className="mt-2 text-3xl font-bold">
            {formatUsd(PLANS.pro.priceCents)}
            <span className="text-base font-medium text-slate-500">/month</span>
          </p>
        </div>
        <ul className="flex-1 space-y-1.5 text-sm text-slate-600">
          <li>✓ {PLANS.pro.monthlyCredits.toLocaleString("en-US")} credits every month</li>
          <li>✓ Unused credits roll over</li>
          <li>✓ Cancel any time in the billing portal</li>
        </ul>
        {currentPlan === "pro" ? (
          <p className="text-center text-sm font-medium text-brand-700">Your current plan</p>
        ) : (
          cta("pro", "Upgrade to Pro")
        )}
      </Card>
      <Card className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold">Top-up</h3>
          <p className="mt-2 text-3xl font-bold">
            {formatUsd(PACKS.pack_500.priceCents)}
            <span className="text-base font-medium text-slate-500"> once</span>
          </p>
        </div>
        <ul className="flex-1 space-y-1.5 text-sm text-slate-600">
          <li>✓ {PACKS.pack_500.credits} credits, never expire</li>
          <li>✓ Works on any plan</li>
          <li>✓ One-time payment</li>
        </ul>
        {cta("pack_500", `Buy ${PACKS.pack_500.credits} credits`, "secondary")}
      </Card>
    </div>
  );
}
