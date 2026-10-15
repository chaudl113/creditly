import { ButtonLink, Card } from "@/components/ui";
import { Statement } from "@/components/statement";
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <p className="text-sm text-slate-500">Credit balance</p>
          <p className="mt-1 text-4xl font-bold tracking-tight" data-testid="credit-balance">
            {balance.toLocaleString("en-US")}
          </p>
          <p className="mt-2 text-xs text-slate-500">1 credit ≈ 1,000 AI tokens</p>
        </Card>
        <Card className="flex flex-col justify-between gap-4 sm:col-span-2">
          <div>
            <h2 className="font-semibold">Summarize & extract</h2>
            <p className="mt-1 text-sm text-slate-600">
              Paste an article, report or URL and get a summary plus a table of the key facts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/app/summarize">New summary</ButtonLink>
            <ButtonLink href="/app/billing" variant="secondary">Buy credits</ButtonLink>
          </div>
        </Card>
      </div>
      <Card>
        <h2 className="mb-4 font-semibold">Credit activity</h2>
        <Statement rows={statement} />
      </Card>
    </div>
  );
}
