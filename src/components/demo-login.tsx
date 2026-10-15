"use client";

import { Loader2Icon, ShieldCheckIcon, UserIcon } from "lucide-react";
import { useActionState } from "react";
import { demoLoginAction } from "@/app/(auth)/actions";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One-click sign-in to the shared demo accounts (public demo mode only). */
export function DemoLoginButtons({
  size = "lg",
  customerLabel = "Try as customer",
  className,
}: {
  size?: "default" | "lg";
  customerLabel?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(demoLoginAction, undefined);
  return (
    <div className={cn("space-y-3", className)}>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" name="role" value="customer" size={size} disabled={pending} className="flex-1" data-testid="demo-customer">
          {pending ? <Loader2Icon className="animate-spin" /> : <UserIcon />}
          {customerLabel}
        </Button>
        <Button type="submit" name="role" value="admin" variant="outline" size={size} disabled={pending} className="flex-1" data-testid="demo-admin">
          <ShieldCheckIcon />
          Try as admin
        </Button>
      </form>
    </div>
  );
}
