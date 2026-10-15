import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db";
import { listUsers } from "@/lib/admin/queries";
import { requireAdminPage } from "@/lib/auth/session";
import { UsersTable } from "./users-table";

export const metadata = { title: "Users · Admin" };

export default async function AdminUsersPage() {
  await requireAdminPage();
  const rows = await listUsers(getDb());
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <Card>
        <CardContent>
          <UsersTable data={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
        </CardContent>
      </Card>
    </div>
  );
}
