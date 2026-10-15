import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <Card>Signed in as {user.email}.</Card>
    </div>
  );
}
