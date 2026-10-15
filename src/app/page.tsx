import { SiteHeader } from "@/components/site-header";
import { ButtonLink, Card } from "@/components/ui";

const features = [
  { title: "Summarize & extract", body: "Paste text or a URL. Get a short summary plus a clean table of the facts, figures and dates inside it." },
  { title: "Pay for what you use", body: "Every run costs credits based on tokens used. Failed runs are refunded automatically." },
  { title: "Plans that fit", body: "Start free, upgrade to Pro for a monthly allowance, or top up with one-off credit packs." },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="py-16 text-center sm:py-24">
          <p className="mb-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            Portfolio demo · Stripe test mode
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Turn long documents into summaries and structured data
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Creditly is a credit-based AI SaaS: subscriptions and top-ups through Stripe, a double-entry credit
            ledger, and an admin dashboard for revenue, refunds and audit.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink href="/signup">Start free — 50 credits</ButtonLink>
            <ButtonLink href="/pricing" variant="secondary">See pricing</ButtonLink>
          </div>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </Card>
          ))}
        </section>
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Creditly · demo project · payments run in Stripe test mode only
      </footer>
    </>
  );
}
