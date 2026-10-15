import Link from "next/link";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { formatDate } from "@/components/statement";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { formatUsd } from "@/lib/billing/catalog";
import { latestSubscription } from "@/lib/billing/queries";
import { testPortalAction } from "../actions";

export const metadata = { title: "Test billing portal" };

function Op({ op, label, variant = "secondary" }: { op: string; label: string; variant?: "secondary" | "danger" | "primary" }) {
  return (
    <form action={testPortalAction}>
      <input type="hidden" name="op" value={op} />
      <Button type="submit" variant={variant}>{label}</Button>
    </form>
  );
}

export default async function TestPortalPage({ searchParams }: PageProps<"/billing/test-portal">) {
  const user = await requireUser();
  const sub = await latestSubscription(getDb(), user.id);
  const { done } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing portal</h1>
      {done && <Alert tone="success">Sent a signed webhook event for “{String(done).replaceAll("_", " ")}”.</Alert>}
      <Card className="space-y-4">
        {!sub ? (
          <p className="text-sm text-slate-600">No subscription yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-semibold">Creditly Pro · {formatUsd(sub.priceCents)}/month</p>
              <Badge tone={sub.status === "active" ? "green" : "slate"}>{sub.status}</Badge>
              {sub.cancelAtPeriodEnd && <Badge tone="amber">cancels at period end</Badge>}
            </div>
            {sub.currentPeriodEnd && <p className="text-sm text-slate-600">Current period ends {formatDate(sub.currentPeriodEnd)}</p>}
            <div className="flex flex-wrap gap-2">
              {sub.status !== "canceled" && (
                <>
                  {sub.cancelAtPeriodEnd ? <Op op="resume" label="Resume subscription" /> : <Op op="cancel_at_period_end" label="Cancel at period end" />}
                  <Op op="renew" label="Simulate next month's renewal" variant="primary" />
                  <Op op="cancel_now" label="Cancel immediately" variant="danger" />
                </>
              )}
            </div>
          </>
        )}
      </Card>
      <Link href="/app/billing" className="text-sm text-brand-600">← Return to Creditly</Link>
    </div>
  );
}
