import {
  ArrowRightIcon,
  BookCheckIcon,
  CheckIcon,
  CreditCardIcon,
  FileTextIcon,
  ScaleIcon,
  ShieldCheckIcon,
  TimerResetIcon,
  WebhookIcon,
} from "lucide-react";
import Link from "next/link";
import { BrowserFrame } from "@/components/browser-frame";
import { DemoLoginButtons } from "@/components/demo-login";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SIGNUP_CREDITS } from "@/lib/billing/catalog";
import { isDemoPublic } from "@/lib/demo";
import { appUrl } from "@/lib/env";
import adminDark from "../../public/landing/admin-dark.jpg";
import adminLight from "../../public/landing/admin-light.jpg";
import summarizeDark from "../../public/landing/summarize-dark.jpg";
import summarizeLight from "../../public/landing/summarize-light.jpg";

const tryIt = [
  { icon: FileTextIcon, title: "Summarize & extract", body: "Paste a report and get a summary plus a table of the amounts, dates and figures in it." },
  { icon: CreditCardIcon, title: "Buy credits", body: "Subscribe or top up with Stripe's test card. Credits land through the signed webhook." },
  { icon: ShieldCheckIcon, title: "Run the admin side", body: "Refund a payment, adjust a balance, then find both in the audit log." },
];

const built = [
  {
    icon: ScaleIcon,
    title: "A ledger the database enforces",
    body: "Balances are the sum of double-entry ledger rows; there is no balance column to drift. Deferred constraint triggers reject any transaction that doesn't net to zero or takes a wallet below zero, and rows can't be updated or deleted.",
    file: "drizzle/0002_ledger_guards.sql",
  },
  {
    icon: WebhookIcon,
    title: "Idempotent Stripe webhooks",
    body: "The event id is stored before anything is applied, so redeliveries only bump a counter. Subscription state only moves forward in Stripe time, and an event that arrives before what it depends on returns 500 so Stripe retries it.",
    file: "src/lib/billing/webhooks.ts",
  },
  {
    icon: TimerResetIcon,
    title: "Reserve, run, settle",
    body: "An AI run first holds credits under the wallet lock, calls the model outside any transaction, then charges for the tokens it actually used and returns the rest. A failed run releases the whole hold.",
    file: "src/lib/ai/jobs.ts",
  },
  {
    icon: BookCheckIcon,
    title: "Audited admin actions",
    body: "Refunds and credit adjustments re-check the admin role in the service layer and write an append-only audit row in the same transaction. A refund keeps the payment locked across the Stripe call, so it can't be booked twice.",
    file: "src/lib/admin/service.ts",
  },
];

const adminPoints = [
  "MRR, net revenue by day and a live check that the ledger balances",
  "Per-user statement with refunds and credit adjustments, each with a required reason",
  "Webhook log that shows duplicate deliveries absorbed and failures to retry",
];

const stack = ["Next.js 16", "TypeScript", "PostgreSQL + Drizzle", "Auth.js", "Stripe", "Claude API", "shadcn/ui", "Vitest", "Playwright"];

export default function LandingPage() {
  const demo = isDemoPublic();
  const host = new URL(appUrl()).host;
  return (
    <>
      <SiteHeader />
      <main className="flex-1 overflow-x-clip">
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[36rem] max-w-5xl rounded-full bg-primary/15 blur-3xl dark:bg-primary/20"
          />
          <div className="mx-auto max-w-6xl px-4 pt-16 text-center sm:pt-24">
            <Badge variant="outline" className="mb-6 bg-background/60 backdrop-blur">
              Portfolio project · Stripe test mode{demo && " · data resets nightly"}
            </Badge>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Summaries and data tables from long documents, paid for in credits
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              A complete SaaS: Stripe subscriptions and top-ups, a double-entry credit ledger checked by Postgres, AI
              runs that reserve credits and settle on actual usage, and an admin area for revenue, refunds and audit.
            </p>
            <div className="mx-auto mt-9 max-w-md">
              {demo ? (
                <>
                  <DemoLoginButtons customerLabel="Try the live demo" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No sign-up: one click signs you in to a shared demo account.
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap justify-center gap-3">
                  <Button asChild size="lg">
                    <Link href="/signup">
                      Start free with {SIGNUP_CREDITS} credits <ArrowRightIcon />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href="/pricing">See pricing</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="mx-auto mt-14 max-w-6xl px-4 sm:mt-20">
            <BrowserFrame
              url={`${host}/app/summarize`}
              light={summarizeLight}
              dark={summarizeDark}
              alt="Creditly summarize screen: a summary, key points and a table of extracted amounts, with the credits charged"
              eager
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-8 sm:grid-cols-3">
            {tryIt.map((t) => (
              <div key={t.title} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card">
                  <t.icon className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{t.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/40 py-20 dark:bg-muted/20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">How it&apos;s built</h2>
              <p className="mt-3 text-muted-foreground">
                The parts of a billing system that usually break, and where to read the code.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {built.map((b) => (
                <Card key={b.title} className="gap-4">
                  <CardHeader>
                    <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <b.icon className="size-5" />
                    </div>
                    <CardTitle>{b.title}</CardTitle>
                    <CardDescription className="leading-relaxed">{b.body}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{b.file}</code>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-8 text-sm text-muted-foreground">
              Tested against a real Postgres, including parallel holds and double submits; a Playwright journey covers
              sign-up → purchase → AI run → admin refund.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-[2fr_3fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">The admin side</h2>
            <p className="mt-3 text-muted-foreground">
              Admin pages and actions re-read the role from the database on every request; the session token carries no role.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {adminPoints.map((p) => (
                <li key={p} className="flex gap-3">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <BrowserFrame url={`${host}/admin`} light={adminLight} dark={adminDark} alt="Creditly admin overview: MRR, revenue chart, ledger balance check and recent admin actions" />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card px-6 py-12 text-center">
            <div className="flex flex-wrap justify-center gap-2">
              {stack.map((s) => (
                <Badge key={s} variant="secondary">{s}</Badge>
              ))}
            </div>
            {demo ? (
              <DemoLoginButtons customerLabel="Try the live demo" className="w-full max-w-md" />
            ) : (
              <Button asChild size="lg">
                <Link href="/signup">Create a free account <ArrowRightIcon /></Link>
              </Button>
            )}
          </div>
        </section>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Creditly · portfolio project · payments run in Stripe test mode only{demo && " · demo data resets nightly"}
      </footer>
    </>
  );
}
