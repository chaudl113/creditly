"use client";

import {
  ArrowLeftRightIcon,
  BookOpenTextIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ScrollTextIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
  WebhookIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Logo } from "./logo";

export type Area = "app" | "admin";

const NAV = {
  app: [
    { href: "/app", label: "Dashboard", icon: LayoutDashboardIcon },
    { href: "/app/summarize", label: "Summarize", icon: SparklesIcon },
    { href: "/app/billing", label: "Billing & credits", icon: CreditCardIcon },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: LayoutDashboardIcon },
    { href: "/admin/users", label: "Users", icon: UsersIcon },
    { href: "/admin/ledger", label: "Credit ledger", icon: BookOpenTextIcon },
    { href: "/admin/webhooks", label: "Webhooks", icon: WebhookIcon },
    { href: "/admin/audit", label: "Audit log", icon: ScrollTextIcon },
  ],
};

export function AppSidebar({
  area,
  user,
  signOutAction,
}: {
  area: Area;
  user: { name: string; email: string; role: "user" | "admin" };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const root = area === "app" ? "/app" : "/admin";
  const isActive = (href: string) => (href === root ? pathname === href : pathname.startsWith(href));
  // Words only, so "Admin (demo)" gives "AD", not "A(".
  const initials = (user.name.match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3 group-data-[collapsible=icon]:px-2">
        <Logo href={root} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{area === "admin" ? "Admin" : "Workspace"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV[area].map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {user.role === "admin" && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={area === "admin" ? "User app" : "Admin"}>
                    <Link href={area === "admin" ? "/app" : "/admin"}>
                      {area === "admin" ? <ArrowLeftRightIcon /> : <ShieldIcon />}
                      <span>{area === "admin" ? "Switch to user app" : "Admin dashboard"}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" data-testid="user-menu">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground" data-testid="current-user">
                      {user.email}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/billing">
                    <CreditCardIcon /> Billing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOutAction()} data-testid="log-out">
                  <LogOutIcon /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
