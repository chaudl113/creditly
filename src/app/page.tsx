import { CoinsIcon, FileTextIcon, LayersIcon } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SIGNUP_CREDITS } from "@/lib/billing/catalog";

const features = [
  {
    icon: FileTextIcon,
    title: "Summarize & extract",
    body: "Paste text or a URL. Get a short summary plus a clean table of the facts, figures and dates inside it.",
  },
  {
    icon: CoinsIcon,
    title: "Pay for what you use",
    body: "Every run costs credits based on the tokens it used. Failed runs are refunded automatically.",
  },
  {
    icon: LayersIcon,
    title: "Plans that fit",
    body: "Start free, upgrade to Pro for a monthly allowance, or top up with one-off credit packs.",
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="py-16 text-center sm:py-24">
          <Badge variant="secondary" className="mb-5">
            Portfolio demo · Stripe test mode
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Turn long documents into summaries and structured data
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Creditly is a credit-based AI SaaS: subscriptions and top-ups through Stripe, a double-entry credit
            ledger, and an admin dashboard for revenue, refunds and audit.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Start free — {SIGNUP_CREDITS} credits</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <f.icon className="mb-2 size-5 text-primary" />
                <CardTitle>{f.title}</CardTitle>
                <CardDescription>{f.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Creditly · demo project · payments run in Stripe test mode only
      </footer>
    </>
  );
}
