import { ExternalLinkIcon } from "lucide-react";
import { Notice } from "@/components/notice";
import { PricingCards } from "@/components/pricing-cards";
import { StatCard } from "@/components/stat-card";
import { formatDate } from "@/components/statement";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      {checkout === "success" && <Notice tone="success">Payment received. Your credits are ready.</Notice>}
      {checkout === "cancelled" && <Notice tone="info">Checkout cancelled. You were not charged.</Notice>}
      {typeof error === "string" && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard label="Credit balance" value={balance.toLocaleString("en-US")} testId="credit-balance" />
        <StatCard
          label="Plan"
          value={<span data-testid="current-plan">{live ? "Pro" : "Free"}</span>}
          action={sub && <StatusBadge status={sub.status} />}
          footer={
            (live || user.stripeCustomerId) && (
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <span>
                  {live && sub?.currentPeriodEnd
                    ? `${sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on ${formatDate(sub.currentPeriodEnd)}`
                    : ""}
                </span>
                {user.stripeCustomerId && (
                  <form action={openPortalAction}>
                    <Button variant="outline" size="sm" type="submit">
                      Manage billing{isStripeMock() ? " (test portal)" : ""} <ExternalLinkIcon />
                    </Button>
                  </form>
                )}
              </div>
            )
          }
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Plans & top-ups</h2>
        <PricingCards signedIn currentPlan={live ? "pro" : "free"} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>Refunds reclaim the unused credits that the payment granted.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{formatDate(p.paidAt)}</TableCell>
                    <TableCell>{p.kind === "subscription" ? "Pro subscription" : "500 credit pack"}</TableCell>
                    <TableCell className="tabular-nums">+{p.creditsGranted}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.refundedCents > 0 && (
                        <Badge variant="destructive" className="mr-2">
                          refunded {formatUsd(p.refundedCents)}
                        </Badge>
                      )}
                      {formatUsd(p.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
