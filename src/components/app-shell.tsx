import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import type { User } from "@/db/schema";
import { Badge, Logo } from "./ui";

export type NavItem = { href: string; label: string };

export function AppShell({
  user,
  nav,
  area,
  children,
}: {
  user: User;
  nav: NavItem[];
  area: "app" | "admin";
  children: ReactNode;
}) {
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            {area === "admin" && <Badge tone="amber">Admin</Badge>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user.role === "admin" && (
              <Link href={area === "admin" ? "/app" : "/admin"} className="text-slate-600 hover:text-slate-900">
                {area === "admin" ? "User app" : "Admin"}
              </Link>
            )}
            <span className="hidden text-slate-500 sm:inline" data-testid="current-user">{user.email}</span>
            <form action={signOutAction}>
              <button className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">Log out</button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
