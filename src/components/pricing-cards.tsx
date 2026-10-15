import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { startCheckoutAction } from "@/app/app/billing/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PACKS, PLANS, SIGNUP_CREDITS, formatUsd } from "@/lib/billing/catalog";
import { cn } from "@/lib/utils";

function Features({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PricingCards({ signedIn, currentPlan }: { signedIn: boolean; currentPlan?: "free" | "pro" }) {
  const cta = (product: string, label: string, variant: "default" | "outline" = "default") =>
    signedIn ? (
      <form action={startCheckoutAction} className="w-full">
        <input type="hidden" name="product" value={product} />
        <Button type="submit" size="lg" variant={variant} className="w-full" data-testid={`buy-${product}`}>
          {label}
        </Button>
      </form>
    ) : (
      <Button asChild size="lg" variant={variant} className="w-full">
        <Link href="/signup">{label}</Link>
      </Button>
    );
  const current = <p className="w-full text-center text-sm font-medium text-muted-foreground">Your current plan</p>;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>{PLANS.free.name}</CardTitle>
          <CardDescription>Try it out, no card required.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          <p className="text-3xl font-semibold">$0</p>
          <Features items={[`${SIGNUP_CREDITS} welcome credits`, "Summaries up to 20,000 characters", "Failed runs refunded automatically"]} />
        </CardContent>
        <CardFooter>
          {currentPlan ? (
            currentPlan === "free" ? current : <p className="w-full text-center text-sm text-muted-foreground">Included in Pro</p>
          ) : (
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link href="/signup">Start free</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
      <Card className={cn("ring-2 ring-primary")}>
        <CardHeader>
          <CardTitle>{PLANS.pro.name}</CardTitle>
          <CardDescription>For regular use.</CardDescription>
          <CardAction>
            <Badge>Most popular</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          <p className="text-3xl font-semibold">
            {formatUsd(PLANS.pro.priceCents)}
            <span className="text-base font-normal text-muted-foreground">/month</span>
          </p>
          <Features
            items={[
              `${PLANS.pro.monthlyCredits.toLocaleString("en-US")} credits every month`,
              "Unused credits roll over",
              "Cancel any time in the billing portal",
            ]}
          />
        </CardContent>
        <CardFooter>{currentPlan === "pro" ? current : cta("pro", "Upgrade to Pro")}</CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Top-up</CardTitle>
          <CardDescription>One-time credit pack.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          <p className="text-3xl font-semibold">
            {formatUsd(PACKS.pack_500.priceCents)}
            <span className="text-base font-normal text-muted-foreground"> once</span>
          </p>
          <Features items={[`${PACKS.pack_500.credits} credits that never expire`, "Works on any plan", "One-time payment"]} />
        </CardContent>
        <CardFooter>{cta("pack_500", `Buy ${PACKS.pack_500.credits} credits`, "outline")}</CardFooter>
      </Card>
    </div>
  );
}
