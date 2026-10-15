import { FlaskConicalIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { isStripeMock } from "@/lib/billing/stripe";

export default function SimulatorLayout({ children }: LayoutProps<"/billing">) {
  if (!isStripeMock()) notFound();
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
        <FlaskConicalIcon className="size-3.5 shrink-0" />
        TEST MODE · Stripe simulator (stripe-mock) · no real money moves · events are signed and sent to
        /api/stripe/webhook
      </div>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <ModeToggle />
        </div>
        {children}
      </main>
    </div>
  );
}
