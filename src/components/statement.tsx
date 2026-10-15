import type { LedgerTxType } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const TX_LABEL: Record<LedgerTxType, string> = {
  signup_grant: "Welcome credits",
  plan_grant: "Plan allowance",
  purchase: "Purchase",
  usage_hold: "Reserved",
  usage_settle: "Job settled",
  usage_release: "Refund (failed job)",
  manual_adjustment: "Adjustment",
  refund_clawback: "Payment refunded",
};

export const formatDate = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export function Amount({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
      )}
    >
      {value > 0 ? "+" : ""}
      {value.toLocaleString("en-US")}
    </span>
  );
}

export function Statement({
  rows,
}: {
  rows: { id: string; type: LedgerTxType; memo: string; createdAt: Date; amount: number }[];
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No credit activity yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Details</TableHead>
          <TableHead className="text-right">Credits</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.id}-${r.amount}`}>
            <TableCell className="text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
            <TableCell>
              <Badge variant={r.amount >= 0 ? "secondary" : "outline"}>{TX_LABEL[r.type]}</Badge>
            </TableCell>
            <TableCell className="max-w-[24rem] truncate">{r.memo}</TableCell>
            <TableCell className="text-right">
              <Amount value={r.amount} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
