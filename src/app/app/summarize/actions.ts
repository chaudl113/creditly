"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { runSummarize, type SummarizeInput } from "@/lib/ai/jobs";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export type SummarizeState = { error?: string; code?: AppError["code"] } | undefined;

export async function summarizeAction(_prev: SummarizeState, form: FormData): Promise<SummarizeState> {
  const user = await requireUser();
  const kind = form.get("kind") === "url" ? "url" : "text";
  const value = String(form.get(kind) ?? "");
  const input: SummarizeInput = kind === "url" ? { kind, url: value.trim() } : { kind, text: value };
  let jobId: string;
  try {
    jobId = (await runSummarize(getDb(), user.id, input)).id;
  } catch (e) {
    if (e instanceof AppError) {
      const error =
        e.code === "INSUFFICIENT_CREDITS"
          ? "Not enough credits for this request. Top up on the Billing page."
          : e.message;
      return { error, code: e.code };
    }
    throw e;
  }
  redirect(`/app/summarize?job=${jobId}`);
}
