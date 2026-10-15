import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";

const nav = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/summarize", label: "Summarize" },
  { href: "/app/billing", label: "Billing & credits" },
];

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  return (
    <AppShell user={user} nav={nav} area="app">
      {children}
    </AppShell>
  );
}
