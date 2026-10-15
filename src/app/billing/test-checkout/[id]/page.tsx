import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { getDb } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { PACKS, PLANS, formatUsd } from "@/lib/billing/catalog";
import { payTestCheckoutAction } from "../../actions";

export const metadata = { title: "Test checkout" };

export default async function TestCheckoutPage({ params }: PageProps<"/billing/test-checkout/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [session] = await getDb()
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, id), eq(checkoutSessions.userId, user.id)));
  if (!session) notFound();
  const isSub = session.kind === "subscription";
  const item = isSub ? `Creditly ${PLANS.pro.name}` : PACKS.pack_500.name;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm text-slate-500">Pay Creditly</p>
        <p className="text-4xl font-bold">
          {formatUsd(session.amountCents)}
          {isSub && <span className="text-lg font-medium text-slate-500"> per month</span>}
        </p>
        <p className="text-slate-700">{item}</p>
        <p className="pt-4 text-xs text-slate-500">
          Session <code className="font-mono">{session.id}</code> was created through the Stripe API (stripe-mock).
        </p>
      </div>
      <Card className="space-y-4">
        {session.status === "completed" ? (
          <p className="text-sm">This checkout is already paid. <Link className="text-brand-600" href="/app/billing">Back to billing</Link></p>
        ) : (
          <form action={payTestCheckoutAction} className="space-y-4">
            <input type="hidden" name="id" value={session.id} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input disabled value={user.email} className="block w-full rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Card information (test card)</span>
              <input disabled value="4242 4242 4242 4242   12/34   123" className="block w-full rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm ring-1 ring-slate-200" />
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input type="checkbox" name="flaky" className="mt-1" />
              <span>Simulate a flaky network: deliver webhooks out of order and twice</span>
            </label>
            <Button type="submit" className="w-full" data-testid="pay-test-checkout">
              {isSub ? "Subscribe" : "Pay"} {formatUsd(session.amountCents)}
            </Button>
            <Link href="/app/billing?checkout=cancelled" className="block text-center text-sm text-slate-500 hover:text-slate-700">
              Cancel and go back
            </Link>
          </form>
        )}
      </Card>
    </div>
  );
}
