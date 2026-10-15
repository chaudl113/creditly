"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { createCheckout, createPortalUrl, type CheckoutRequest } from "@/lib/billing/checkout";
import { AppError } from "@/lib/errors";

export async function startCheckoutAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/pricing");
  const product = String(form.get("product"));
  const req: CheckoutRequest | null =
    product === "pro" ? { kind: "subscription", plan: "pro" } : product === "pack_500" ? { kind: "credit_pack", pack: "pack_500" } : null;
  if (!req) redirect("/pricing");
  let url: string;
  try {
    url = await createCheckout(getDb(), user, req);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/billing?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(url);
}

export async function openPortalAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(await createPortalUrl(getDb(), user));
}
