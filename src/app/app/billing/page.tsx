import { Alert, Badge, Button, Card } from "@/components/ui";
import { PricingCards } from "@/components/pricing-cards";
import { formatDate } from "@/components/statement";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/checkout";
import { formatUsd } from "@/lib/billing/catalog";
import { latestSubscription, paymentsWithRefunds } from "@/lib/billing/queries";
import { isStripeMock } from "@/lib/billing/stripe";
import { getUserBalance } from "@/lib/ledger";
import { openPortalAction } from "./actions";

export const metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  const user = await requireUser();
  const db = getDb();
  const { checkout, error } = await searchParams;
  const [balance, sub, history] = await Promise.all([
    getUserBalance(db, user.id),
    latestSubscription(db, user.id),
    paymentsWithRefunds(db, { userId: user.id, limit: 20 }),
  ]);
  const live = sub && LIVE_SUBSCRIPTION_STATUSES.includes(sub.status);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Billing & credits</h1>
      {checkout === "success" && <Alert tone="success">Payment received. Your credits are ready.</Alert>}
      {checkout === "cancelled" && <Alert tone="info">Checkout cancelled. You were not charged.</Alert>}
      {typeof error === "string" && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-500">Credit balance</p>
          <p className="mt-1 text-4xl font-bold tracking-tight" data-testid="credit-balance">
            {balance.toLocaleString("en-US")}
          </p>
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Plan</p>
            {sub && <Badge tone={live ? "green" : "slate"}>{sub.status}</Badge>}
          </div>
          <p className="text-2xl font-semibold" data-testid="current-plan">{live ? "Pro" : "Free"}</p>
          {live && sub?.currentPeriodEnd && (
            <p className="text-sm text-slate-600">
              {sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on {formatDate(sub.currentPeriodEnd)}
            </p>
          )}
          {user.stripeCustomerId && (
            <form action={openPortalAction}>
              <Button variant="secondary" type="submit">
                Manage billing{isStripeMock() ? " (test portal)" : ""}
              </Button>
            </form>
          )}
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Plans & top-ups</h2>
        <PricingCards signedIn currentPlan={live ? "pro" : "free"} />
      </section>

      <Card>
        <h2 className="mb-4 font-semibold">Payment history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No payments yet.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Credits</th>
                  <th className="px-6 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-2 text-slate-500">{formatDate(p.paidAt)}</td>
                    <td className="px-2 py-2">{p.kind === "subscription" ? "Pro subscription" : "500 credit pack"}</td>
                    <td className="px-2 py-2">+{p.creditsGranted}</td>
                    <td className="px-6 py-2 text-right">
                      {formatUsd(p.amountCents)}
                      {p.refundedCents > 0 && (
                        <span className="ml-2"><Badge tone="rose">refunded {formatUsd(p.refundedCents)}</Badge></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
