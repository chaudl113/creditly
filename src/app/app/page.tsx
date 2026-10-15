import { CreditCardIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { Statement } from "@/components/statement";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { getUserBalance, userStatement } from "@/lib/ledger";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const db = getDb();
  const [balance, statement] = await Promise.all([getUserBalance(db, user.id), userStatement(db, user.id, 20)]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Credit balance"
          value={balance.toLocaleString("en-US")}
          testId="credit-balance"
          footer="A typical summary costs 3–8 credits."
        />
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Summarize & extract</CardTitle>
            <CardDescription>
              Paste an article, report or URL and get a summary plus a table of the key facts.
            </CardDescription>
          </CardHeader>
          <CardFooter className="mt-auto flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app/summarize">
                <SparklesIcon /> New summary
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/billing">
                <CreditCardIcon /> Buy credits
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Credit activity</CardTitle>
          <CardDescription>Every change to your balance is a ledger entry; the balance is their sum.</CardDescription>
        </CardHeader>
        <CardContent>
          <Statement rows={statement} />
        </CardContent>
      </Card>
    </div>
  );
}
