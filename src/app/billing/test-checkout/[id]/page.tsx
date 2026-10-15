import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
        <p className="text-sm text-muted-foreground">Pay Creditly</p>
        <p className="text-4xl font-semibold">
          {formatUsd(session.amountCents)}
          {isSub && <span className="text-lg font-normal text-muted-foreground"> per month</span>}
        </p>
        <p>{item}</p>
        <p className="pt-4 text-xs text-muted-foreground">
          Session <code className="font-mono">{session.id}</code> was created through the Stripe API (stripe-mock).
        </p>
      </div>
      <Card>
        <CardContent>
          {session.status === "completed" ? (
            <p className="text-sm">
              This checkout is already paid.{" "}
              <Link className="text-primary underline-offset-4 hover:underline" href="/app/billing">
                Back to billing
              </Link>
            </p>
          ) : (
            <form action={payTestCheckoutAction}>
              <input type="hidden" name="id" value={session.id} />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="tc-email">Email</FieldLabel>
                  <Input id="tc-email" disabled value={user.email} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tc-card">Card information (test card)</FieldLabel>
                  <Input id="tc-card" disabled value="4242 4242 4242 4242   12/34   123" className="font-mono" />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="tc-flaky" name="flaky" />
                  <FieldContent>
                    <FieldLabel htmlFor="tc-flaky">Simulate a flaky network</FieldLabel>
                    <FieldDescription>Deliver the webhooks out of order and twice.</FieldDescription>
                  </FieldContent>
                </Field>
                <Button type="submit" size="lg" className="w-full" data-testid="pay-test-checkout">
                  {isSub ? "Subscribe" : "Pay"} {formatUsd(session.amountCents)}
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/app/billing?checkout=cancelled">Cancel and go back</Link>
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
