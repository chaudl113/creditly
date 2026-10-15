import { and, desc, eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatCard } from "@/components/stat-card";
import { formatDate, Statement } from "@/components/statement";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb } from "@/db";
import { aiJobs } from "@/db/schema";
import { auditEntries } from "@/lib/admin/queries";
import { requireAdminPage } from "@/lib/auth/session";
import { formatUsd } from "@/lib/billing/catalog";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/checkout";
import { latestSubscription, paymentsWithRefunds } from "@/lib/billing/queries";
import { getUserBalance, userStatement } from "@/lib/ledger";
import { findUserById } from "@/lib/users";
import { AdjustCreditsDialog, RefundDialog } from "../../admin-forms";

export const metadata = { title: "User · Admin" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const user = await findUserById(db, id);
  if (!user) notFound();
  const [balance, sub, history, statement, jobs, audit] = await Promise.all([
    getUserBalance(db, id),
    latestSubscription(db, id),
    paymentsWithRefunds(db, { userId: id }),
    userStatement(db, id, 100),
    db.select().from(aiJobs).where(and(eq(aiJobs.userId, id))).orderBy(desc(aiJobs.createdAt)).limit(50),
    auditEntries(db, { targetUserId: id }),
  ]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/users"><ArrowLeftIcon /> Users</Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
        <span className="text-muted-foreground">{user.email}</span>
        {user.role === "admin" && <Badge variant="outline">admin</Badge>}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Credit balance"
          value={<span data-testid="admin-user-balance">{balance.toLocaleString("en-US")}</span>}
          action={<AdjustCreditsDialog userId={user.id} email={user.email} />}
        />
        <StatCard
          label="Plan"
          value={sub && LIVE_SUBSCRIPTION_STATUSES.includes(sub.status) ? "Pro" : "Free"}
          action={sub && <StatusBadge status={sub.status} />}
          footer={sub?.currentPeriodEnd ? `Period ends ${formatDate(sub.currentPeriodEnd)}` : undefined}
        />
        <StatCard
          label="Lifetime paid"
          value={formatUsd(history.reduce((acc, p) => acc + p.amountCents - p.refundedCents, 0))}
          footer={`Joined ${formatDate(user.createdAt)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Refunds are sent to Stripe and reclaim a matching share of the granted credits.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((p) => {
                  const label = p.kind === "subscription" ? "Pro subscription" : "500 credit pack";
                  return (
                    <TableRow key={p.id} data-testid="admin-payment-row">
                      <TableCell className="text-muted-foreground">{formatDate(p.paidAt)}</TableCell>
                      <TableCell>{label}</TableCell>
                      <TableCell className="tabular-nums">+{p.creditsGranted}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.refundedCents > 0 && (
                          <Badge variant="destructive" className="mr-2">refunded {formatUsd(p.refundedCents)}</Badge>
                        )}
                        {formatUsd(p.amountCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <RefundDialog
                          paymentId={p.id}
                          refundableCents={p.paymentIntentId ? p.amountCents - p.refundedCents : 0}
                          label={`${label}, ${formatUsd(p.amountCents)} on ${formatDate(p.paidAt)}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Credit ledger</TabsTrigger>
          <TabsTrigger value="jobs">AI runs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit ({audit.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <Card>
            <CardContent>
              <Statement rows={statement} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="jobs">
          <Card>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No AI runs.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tokens in / out</TableHead>
                      <TableHead className="text-right">Reserved → charged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="text-muted-foreground">{formatDate(j.createdAt)}</TableCell>
                        <TableCell>{j.model ?? j.provider}</TableCell>
                        <TableCell>
                          <StatusBadge status={j.status} />
                          {j.error && <span className="ml-2 text-xs text-muted-foreground">{j.error}</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">{j.inputTokens ?? "–"} / {j.outputTokens ?? "–"}</TableCell>
                        <TableCell className="text-right tabular-nums">{j.creditsReserved} → {j.creditsCharged ?? "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Admin actions on this user</CardTitle>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                        <TableCell>{a.actorEmail}</TableCell>
                        <TableCell><Badge variant="secondary">{a.action}</Badge></TableCell>
                        <TableCell className="whitespace-normal">{a.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
