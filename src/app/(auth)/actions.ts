"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { getDb } from "@/db";
import { AppError } from "@/lib/errors";
import { appUrl } from "@/lib/env";
import { createUser, requestPasswordReset, resetPassword } from "@/lib/users";

export type FormState = { error?: string; ok?: string } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await createUser(getDb(), parsed.data);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
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
    if (e instanceof AuthError) return { error: "Wrong email or password." };
    throw e; // includes Next's redirect signal
  }
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
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
