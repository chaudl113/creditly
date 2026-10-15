import type { LedgerTxType } from "@/db/schema";
import { Badge } from "./ui";

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
    <span className={value >= 0 ? "font-mono text-emerald-700" : "font-mono text-rose-700"}>
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
  if (rows.length === 0) return <p className="text-sm text-slate-500">No credit activity yet.</p>;
  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-6 py-2 font-medium">When</th>
            <th className="px-2 py-2 font-medium">Type</th>
            <th className="px-2 py-2 font-medium">Details</th>
            <th className="px-6 py-2 text-right font-medium">Credits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={`${r.id}-${r.amount}`}>
              <td className="whitespace-nowrap px-6 py-2 text-slate-500">{formatDate(r.createdAt)}</td>
              <td className="px-2 py-2">
                <Badge tone={r.amount >= 0 ? "green" : "slate"}>{TX_LABEL[r.type]}</Badge>
              </td>
              <td className="px-2 py-2 text-slate-700">{r.memo}</td>
              <td className="px-6 py-2 text-right">
                <Amount value={r.amount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
