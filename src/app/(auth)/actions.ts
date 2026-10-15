"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { getDb } from "@/db";
import { isDemoPublic, type DemoRole } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import { appUrl } from "@/lib/env";
import { AUTH_LIMITS, clientIp, hit } from "@/lib/rate-limit";
import { createUser, requestPasswordReset, resetPassword } from "@/lib/users";

export type FormState = { error?: string; ok?: string; values?: { name?: string; email?: string } } | undefined;

/** Non-secret fields echoed back on error, so React's post-action form reset keeps them. */
const keep = (form: FormData) => ({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") });

const TOO_MANY = "Too many attempts from your network. Wait a few minutes and try again.";
const isRateLimited = (e: unknown) => e instanceof CredentialsSignin && e.code === "rate_limited";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: keep(form) };
  if (isDemoPublic() && !(await hit(getDb(), `signup:${clientIp(await headers())}`, AUTH_LIMITS.signup))) {
    return { error: TOO_MANY, values: keep(form) };
  }
  try {
    await createUser(getDb(), parsed.data);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, values: keep(form) };
    throw e;
  }
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/app?welcome=1",
  });
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const next = String(form.get("next") ?? "");
  try {
    await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirectTo: next.startsWith("/") && !next.startsWith("//") ? next : "/app",
    });
  } catch (e) {
    if (isRateLimited(e)) return { error: TOO_MANY, values: keep(form) };
    if (e instanceof AuthError) return { error: "Wrong email or password.", values: keep(form) };
    throw e; // includes Next's redirect signal
  }
}

/** "Try as customer / admin" in public demo mode. Credentials stay server-side. */
export async function demoLoginAction(_: FormState, form: FormData): Promise<FormState> {
  const role: DemoRole = form.get("role") === "admin" ? "admin" : "customer";
  try {
    await signIn("demo", { role, redirectTo: role === "admin" ? "/admin" : "/app" });
  } catch (e) {
    if (isRateLimited(e)) return { error: TOO_MANY };
    if (e instanceof AuthError) return { error: "The demo accounts are not available right now." };
    throw e;
  }
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email", values: keep(form) };
  if (isDemoPublic()) {
    return { ok: "This is a public demo, so no email is sent. Use “Try as customer” on the sign-in page, or create a new account." };
  }
  await requestPasswordReset(getDb(), email.data, appUrl());
  return { ok: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const password = z.string().min(8).max(200).safeParse(form.get("password"));
  if (!password.success) return { error: "Password must be at least 8 characters" };
  try {
    await resetPassword(getDb(), String(form.get("token") ?? ""), password.data);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect("/login?reset=1");
}
