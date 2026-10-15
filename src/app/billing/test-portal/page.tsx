import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Notice } from "@/components/notice";
import { formatDate } from "@/components/statement";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { formatUsd } from "@/lib/billing/catalog";
import { latestSubscription } from "@/lib/billing/queries";
import { testPortalAction } from "../actions";

export const metadata = { title: "Test billing portal" };

function Op({ op, label, variant = "outline" }: { op: string; label: string; variant?: "outline" | "destructive" | "default" }) {
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
      {done && <Notice tone="success">Sent a signed webhook event for “{String(done).replaceAll("_", " ")}”.</Notice>}
      <Card>
        {!sub ? (
          <CardContent className="text-sm text-muted-foreground">No subscription yet.</CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Creditly Pro · {formatUsd(sub.priceCents)}/month</CardTitle>
              {sub.currentPeriodEnd && <CardDescription>Current period ends {formatDate(sub.currentPeriodEnd)}</CardDescription>}
              <CardAction className="flex gap-2">
                <StatusBadge status={sub.status} />
                {sub.cancelAtPeriodEnd && <StatusBadge status="cancel" tone="warning" label="cancels at period end" />}
              </CardAction>
            </CardHeader>
            {sub.status !== "canceled" && (
              <CardFooter className="flex flex-wrap gap-2">
                {sub.cancelAtPeriodEnd ? <Op op="resume" label="Resume subscription" /> : <Op op="cancel_at_period_end" label="Cancel at period end" />}
                <Op op="renew" label="Simulate next month's renewal" variant="default" />
                <Op op="cancel_now" label="Cancel immediately" variant="destructive" />
              </CardFooter>
            )}
          </>
        )}
      </Card>
      <Button asChild variant="ghost">
        <Link href="/app/billing"><ArrowLeftIcon /> Return to Creditly</Link>
      </Button>
    </div>
  );
}
