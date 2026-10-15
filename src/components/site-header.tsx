import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { ButtonLink, Logo } from "./ui";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/pricing" className="rounded-md px-2 py-1 text-slate-600 hover:text-slate-900">
            Pricing
          </Link>
          {user ? (
            <ButtonLink href="/app">Open app</ButtonLink>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-2 py-1 text-slate-600 hover:text-slate-900">
                Log in
              </Link>
              <ButtonLink href="/signup">Start free</ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
