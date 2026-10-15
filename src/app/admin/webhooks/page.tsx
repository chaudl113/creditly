import Link from "next/link";
import { formatDate } from "@/components/statement";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb } from "@/db";
import { webhookEvents } from "@/lib/admin/queries";
import { requireAdminPage } from "@/lib/auth/session";

export const metadata = { title: "Webhooks · Admin" };

const FILTERS = ["all", "processed", "ignored", "failed", "pending"] as const;

export default async function AdminWebhooksPage({ searchParams }: PageProps<"/admin/webhooks">) {
  await requireAdminPage();
  const { status } = await searchParams;
  const current = FILTERS.find((f) => f === status) ?? "all";
  const events = await webhookEvents(getDb(), current === "all" ? undefined : current);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stripe webhooks</h1>
      <Card>
        <CardHeader>
          <CardTitle>Event log</CardTitle>
          <CardDescription>
            Each event id is stored once; repeats only bump the delivery counter. Failed events return HTTP 500 so
            Stripe retries them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={current}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f} value={f} asChild>
                  <Link href={f === "all" ? "/admin/webhooks" : `/admin/webhooks?status=${f}`} className="capitalize">{f}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deliveries</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id} data-testid="webhook-row">
                    <TableCell className="text-muted-foreground">{formatDate(e.receivedAt)}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{e.type}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{e.id}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={e.status} /></TableCell>
                    <TableCell className="tabular-nums">
                      {e.deliveries}
                      {e.deliveries > 1 && <Badge variant="outline" className="ml-2">duplicate</Badge>}
                    </TableCell>
                    <TableCell className="max-w-sm text-xs whitespace-normal text-muted-foreground">
                      {e.lastError ?? e.note}
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
