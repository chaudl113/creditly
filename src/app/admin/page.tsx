import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { formatDate } from "@/components/statement";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { auditEntries, overview } from "@/lib/admin/queries";
import { releaseStaleJobs } from "@/lib/ai/jobs";
import { requireAdminPage } from "@/lib/auth/session";
import { formatUsd } from "@/lib/billing/catalog";
import { RevenueChart } from "./revenue-chart";

export const metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const db = getDb();
  await releaseStaleJobs(db);
  const [o, audit] = await Promise.all([overview(db), auditEntries(db, { limit: 5 })]);
  const balanced = o.ledger.total === 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="MRR"
          value={<span data-testid="admin-mrr">{formatUsd(o.mrrCents)}</span>}
          footer={`${o.activeSubscriptions} active subscription${o.activeSubscriptions === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Net revenue · 30 days"
          value={<span data-testid="admin-revenue">{formatUsd(o.revenue30dCents)}</span>}
          footer="Payments minus refunds"
        />
        <StatCard label="Users" value={o.users.total.toLocaleString("en-US")} footer={`${o.users.new7d} new in the last 7 days`} />
        <StatCard
          label="Credits outstanding"
          value={o.ledger.userCredits.toLocaleString("en-US")}
          action={
            balanced ? (
              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400" data-testid="ledger-balanced">
                <CheckCircle2Icon /> Ledger balanced
              </Badge>
            ) : (
              <Badge variant="destructive">
                <TriangleAlertIcon /> Off by {o.ledger.total}
              </Badge>
            )
          }
          footer="Sum of all user wallets"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue by day</CardTitle>
            <CardDescription>Net of refunds, last 30 days (UTC)</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={o.revenue} />
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <StatCard
            label="AI runs · 24 h"
            value={o.jobs24h.total.toLocaleString("en-US")}
            footer={`${o.jobs24h.failed} failed (refunded) · ${o.jobs24h.credits.toLocaleString("en-US")} credits used`}
          />
          <StatCard
            label="Stripe webhooks"
            value={o.webhooks.total.toLocaleString("en-US")}
            footer={
              <span>
                {o.webhooks.duplicates} duplicate deliveries absorbed ·{" "}
                <Link href="/admin/webhooks?status=failed" className={o.webhooks.failed ? "text-destructive underline" : ""}>
                  {o.webhooks.failed} failed
                </Link>
              </span>
            }
          />
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent admin actions</CardTitle>
          <CardAction>
            <Link href="/admin/audit" className="text-sm text-primary underline-offset-4 hover:underline">View all</Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin actions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                    <TableCell>{a.actorEmail}</TableCell>
                    <TableCell><Badge variant="secondary">{a.action}</Badge></TableCell>
                    <TableCell>{a.targetEmail}</TableCell>
                    <TableCell className="max-w-xs truncate">{a.reason}</TableCell>
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
