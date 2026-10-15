"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { adminAdjustCredits, adminRefund } from "@/lib/admin/service";
import { getCurrentUser } from "@/lib/auth/session";
import { formatUsd } from "@/lib/billing/catalog";
import { getStripe } from "@/lib/billing/stripe";
import { AppError } from "@/lib/errors";

export type AdminActionState =
  | { ok?: string; error?: string; at?: number; values?: Record<string, string> }
  | undefined;

async function run(form: FormData, work: (actorId: string) => Promise<string>): Promise<AdminActionState> {
  const actor = await getCurrentUser();
  // The service re-checks the role from the database; this keeps the error friendly.
  if (!actor || actor.role !== "admin") return { error: "Admin access required", at: Date.now() };
  try {
    const ok = await work(actor.id);
    revalidatePath("/admin", "layout");
    return { ok, at: Date.now() };
  } catch (e) {
    // Echo the inputs so React's post-action form reset doesn't wipe them.
    const values = Object.fromEntries([...form].map(([k, v]) => [k, String(v)]));
    if (e instanceof AppError) return { error: e.message, at: Date.now(), values };
    console.error("[admin] action failed", e);
    return { error: "Something went wrong. Check the server log.", at: Date.now(), values };
  }
}

export async function adjustCreditsAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return run(form, async (actorId) => {
    const delta = Number(form.get("delta"));
    const sign = form.get("direction") === "debit" ? -1 : 1;
    await adminAdjustCredits(getDb(), actorId, {
      userId: String(form.get("userId")),
      delta: sign * Math.abs(delta),
      reason: String(form.get("reason") ?? ""),
      requestId: String(form.get("requestId")),
    });
    return `${sign > 0 ? "Added" : "Removed"} ${Math.abs(delta).toLocaleString("en-US")} credits`;
  });
}

export async function refundAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  return run(form, async (actorId) => {
    const amountCents = Math.round(Number(form.get("amount")) * 100);
    const res = await adminRefund(
      getDb(),
      actorId,
      {
        paymentId: String(form.get("paymentId")),
        amountCents,
        reason: String(form.get("reason") ?? ""),
        requestId: String(form.get("requestId")),
      },
      getStripe(),
    );
    return `Refunded ${formatUsd(amountCents)}; ${res.creditsReclaimed} credits reclaimed`;
  });
}
