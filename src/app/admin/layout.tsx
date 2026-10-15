import { AppShell } from "@/components/app-shell";
import { requireAdminPage } from "@/lib/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdminPage();
  return (
    <AppShell user={admin} area="admin">
      {children}
    </AppShell>
  );
}
