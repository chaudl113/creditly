import { and, count, desc, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { aiJobs, type AiJob } from "@/db/schema";
import { holdCredits, releaseHold, settleHold } from "@/lib/credits";
import { AppError } from "@/lib/errors";
import { lockUserAccounts, userAccountCode } from "@/lib/ledger";
import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo";
import { fetchUrlText } from "./fetch-url";
import { MAX_INPUT_CHARS, creditsFor, reservationFor } from "./pricing";
import { ProviderError, type SummaryProvider } from "./types";

export const RATE_LIMIT = { jobs: 5, windowMs: 60_000 };
const STALE_AFTER_MS = 10 * 60_000;

export function defaultProvider(): SummaryProvider {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : new DemoProvider();
}

export type SummarizeInput = { kind: "text"; text: string } | { kind: "url"; url: string };

/**
 * Reserve → run → settle. The reservation, the rate-limit check and the job
 * row are written in one transaction under the user's wallet lock, so a
 * burst of parallel requests can neither overspend nor skip the limit.
 * Whatever happens after that, the job is closed exactly once.
 */
export async function runSummarize(
  db: Db,
  userId: string,
  input: SummarizeInput,
  provider: SummaryProvider = defaultProvider(),
  now = new Date(),
): Promise<AiJob> {
  if (input.kind === "text" && input.text.trim().length < 40) {
    throw new AppError("VALIDATION", "Paste at least a few sentences (40+ characters).");
  }
  if (input.kind === "text" && input.text.length > MAX_INPUT_CHARS) {
    throw new AppError("VALIDATION", `Text is limited to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters.`);
  }
  await releaseStaleJobs(db, now);

  // URL inputs reserve for the maximum size; the real cost settles later.
  const inputChars = input.kind === "text" ? input.text.length : MAX_INPUT_CHARS;
  const reserved = reservationFor(inputChars);

  const job = await db.transaction(async (tx) => {
    await lockUserAccounts(tx, [userAccountCode(userId)]);
    const [{ recent }] = await tx
      .select({ recent: count() })
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, userId), gt(aiJobs.createdAt, new Date(now.getTime() - RATE_LIMIT.windowMs))));
    if (recent >= RATE_LIMIT.jobs) {
      throw new AppError("RATE_LIMITED", `Limit is ${RATE_LIMIT.jobs} summaries per minute. Try again shortly.`);
    }
    const [row] = await tx
      .insert(aiJobs)
      .values({
        userId,
        source: input.kind,
        sourceUrl: input.kind === "url" ? input.url : null,
        inputChars,
        provider: provider.name,
        creditsReserved: reserved,
        createdAt: now,
      })
      .returning();
    await holdCredits(tx, { userId, jobId: row.id, amount: reserved });
    return row;
  });

  try {
    let text = input.kind === "text" ? input.text : await fetchUrlText(input.url);
    let truncated = false;
    if (text.length > MAX_INPUT_CHARS) {
      text = text.slice(0, MAX_INPUT_CHARS);
      truncated = true;
    }
    const result = await provider.summarize(text);
    const charged = Math.min(reserved, creditsFor(result));
    return await db.transaction(async (tx) => {
      await settleHold(tx, { userId, jobId: job.id, reserved, charged });
      const [done] = await tx
        .update(aiJobs)
        .set({
          status: "succeeded",
          inputChars: text.length,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          creditsCharged: charged,
          result: { ...result.output, truncated },
          finishedAt: new Date(),
        })
        .where(eq(aiJobs.id, job.id))
        .returning();
      return done;
    });
  } catch (e) {
    const message = e instanceof ProviderError ? e.message : "Unexpected error while summarising";
    if (!(e instanceof ProviderError)) console.error("[ai] job failed", job.id, e);
    return failJob(db, job, message);
  }
}

async function failJob(db: Db, job: AiJob, reason: string): Promise<AiJob> {
  return db.transaction(async (tx) => {
    await releaseHold(tx, { userId: job.userId, jobId: job.id, reserved: job.creditsReserved, reason });
    const [failed] = await tx
      .update(aiJobs)
      .set({ status: "failed", error: reason, creditsCharged: 0, finishedAt: new Date() })
      .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, "running")))
      .returning();
    return failed ?? job;
  });
}

/** Jobs stuck in "running" (process crashed mid-call) get their hold back. */
export async function releaseStaleJobs(db: Db, now = new Date()): Promise<number> {
  const stale = await db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.status, "running"), lt(aiJobs.createdAt, new Date(now.getTime() - STALE_AFTER_MS))))
    .limit(50);
  for (const job of stale) await failJob(db, job, "Timed out");
  return stale.length;
}

export async function recentJobs(db: Db, userId: string, limit = 10) {
  return db.select().from(aiJobs).where(eq(aiJobs.userId, userId)).orderBy(desc(aiJobs.createdAt)).limit(limit);
}
