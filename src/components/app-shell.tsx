import type { ReactNode } from "react";
import { signOut } from "@/auth";
import type { User } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, type Area } from "./app-sidebar";
import { ModeToggle } from "./mode-toggle";

export function AppShell({ user, area, children }: { user: User; area: Area; children: ReactNode }) {
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }
  return (
    <SidebarProvider>
      <AppSidebar
        area={area}
        user={{ name: user.name, email: user.email, role: user.role }}
        signOutAction={signOutAction}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 self-center data-[orientation=vertical]:h-4" />
          <span className="text-sm font-medium">{area === "admin" ? "Admin" : "Creditly"}</span>
          {area === "admin" && <Badge variant="outline">Restricted</Badge>}
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
