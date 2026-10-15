import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import type { User } from "@/db/schema";
import { findUserById } from "@/lib/users";

/**
 * Data Access Layer entry point. Every page, server action and route handler
 * resolves the caller through here; the role always comes from the database,
 * never from the cookie.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await findUserById(getDb(), id);
  if (!user) return null;
  // A password reset invalidates every session issued before it.
  if (user.passwordChangedAt && session.authTime < user.passwordChangedAt.getTime()) return null;
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/app");
  return user;
}
