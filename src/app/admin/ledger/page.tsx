import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { Amount, formatDate, TX_LABEL } from "@/components/statement";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { requireAdminPage } from "@/lib/auth/session";
import { recentTransactions, trialBalance } from "@/lib/ledger";

export const metadata = { title: "Ledger · Admin" };

const accountLabel = (code: string) => (code.startsWith("user:") ? `user wallet ${code.slice(5, 13)}…` : code);

export default async function AdminLedgerPage() {
  await requireAdminPage();
  const db = getDb();
  const [tb, txs] = await Promise.all([trialBalance(db), recentTransactions(db, 50)]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Credit ledger</h1>
      <Card>
        <CardHeader>
          <CardTitle>Trial balance</CardTitle>
          <CardDescription>
            Every transaction sums to zero, so all accounts together must too. The database enforces it at commit.
          </CardDescription>
          <CardAction>
            {tb.total === 0 ? (
              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
                <CheckCircle2Icon /> Balanced
              </Badge>
            ) : (
              <Badge variant="destructive"><TriangleAlertIcon /> Off by {tb.total}</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tb.system.map((a) => (
                <TableRow key={a.code}>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell className="text-right"><Amount value={a.balance} /></TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-mono text-xs">user:* (all wallets)</TableCell>
                <TableCell className="text-right"><Amount value={tb.userCredits} /></TableCell>
              </TableRow>
              <TableRow className="font-medium">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono" data-testid="trial-balance-total">{tb.total}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>Append-only: corrections are new transactions, never edits.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead>Entries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((t) => (
                <TableRow key={t.id} className="align-top">
                  <TableCell className="text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
                  <TableCell><Badge variant="secondary">{TX_LABEL[t.type]}</Badge></TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{t.memo}</TableCell>
                  <TableCell>
                    <div className="grid grid-cols-[1fr_auto] gap-x-4 font-mono text-xs">
                      {t.entries.map((e, i) => (
                        <div key={i} className="contents">
                          <span className="text-muted-foreground">{accountLabel(e.account)}</span>
                          <span className="text-right"><Amount value={e.amount} /></span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
