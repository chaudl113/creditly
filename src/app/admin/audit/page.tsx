import Link from "next/link";
import { formatDate } from "@/components/statement";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { auditEntries } from "@/lib/admin/queries";
import { requireAdminPage } from "@/lib/auth/session";

export const metadata = { title: "Audit log · Admin" };

function describe(details: Record<string, unknown>) {
  if (typeof details.delta === "number") return `${details.delta > 0 ? "+" : ""}${details.delta} credits`;
  if (typeof details.amountCents === "number") {
    return `$${(details.amountCents / 100).toFixed(2)} refunded, ${details.creditsReclaimed ?? 0} credits reclaimed`;
  }
  return "";
}

export default async function AdminAuditPage() {
  await requireAdminPage();
  const rows = await auditEntries(getDb(), { limit: 200 });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Admin actions</CardTitle>
          <CardDescription>Append-only. Every manual credit change and refund, with who did it and why.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin actions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} data-testid="audit-row">
                    <TableCell className="text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                    <TableCell>{a.actorEmail}</TableCell>
                    <TableCell><Badge variant="secondary">{a.action}</Badge></TableCell>
                    <TableCell>
                      {a.targetUserId ? (
                        <Link href={`/admin/users/${a.targetUserId}`} className="hover:underline">{a.targetEmail}</Link>
                      ) : "–"}
                    </TableCell>
                    <TableCell className="tabular-nums">{describe(a.details)}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{a.reason}</TableCell>
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
