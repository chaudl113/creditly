import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { aiJobs } from "@/db/schema";
import { DemoProvider } from "@/lib/ai/demo";
import { isPrivateAddress, fetchUrlText } from "@/lib/ai/fetch-url";
import { RATE_LIMIT, releaseStaleJobs, runSummarize } from "@/lib/ai/jobs";
import { creditsFor, reservationFor } from "@/lib/ai/pricing";
import { ProviderError, type SummaryProvider } from "@/lib/ai/types";
import { SIGNUP_CREDITS } from "@/lib/billing/catalog";
import { adjustCredits, holdCredits } from "@/lib/credits";
import { SYSTEM, getBalance, getUserBalance, trialBalance } from "@/lib/ledger";
import { makeUser, resetDb, testDb } from "./helpers";

const db = testDb();
beforeEach(() => resetDb());

const ARTICLE = `Quarterly update
Revenue grew 18% to $4.2 million in Q3 2026, driven by new enterprise contracts.
The company hired 12 engineers and opened an office in Lisbon on Sep 1, 2026.
Churn fell to 2.1% while gross margin held at 71%. The board approved a $500,000 budget for research.`;

/** A provider with fixed token usage, to test pricing exactly. */
const fixed = (inputTokens: number, outputTokens: number): SummaryProvider => ({
  name: "demo",
  summarize: async () => ({
    output: { title: "t", summary: "s", key_points: [], table: { columns: [], rows: [] } },
    inputTokens,
    outputTokens,
    model: "fixed",
  }),
});

describe("pricing", () => {
  it("charges by tokens with output weighted 5x, rounded up, minimum 1", () => {
    expect(creditsFor({ inputTokens: 0, outputTokens: 0 })).toBe(1);
    expect(creditsFor({ inputTokens: 1000, outputTokens: 0 })).toBe(1);
    expect(creditsFor({ inputTokens: 1001, outputTokens: 0 })).toBe(2);
    expect(creditsFor({ inputTokens: 2000, outputTokens: 600 })).toBe(5);
  });
});

describe("AI jobs and credits", () => {
  it("reserves, then charges the real cost and returns the rest", async () => {
    const user = await makeUser();
    const job = await runSummarize(db, user.id, { kind: "text", text: ARTICLE }, fixed(2000, 600));
    expect(job.status).toBe("succeeded");
    expect(job.creditsReserved).toBe(reservationFor(ARTICLE.length));
    expect(job.creditsCharged).toBe(5);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS - 5);
    expect(await getBalance(db, SYSTEM.holds)).toBe(0);
    expect(await getBalance(db, SYSTEM.usage)).toBe(5);
    expect((await trialBalance(db)).total).toBe(0);
  });

  it("never charges more than the reservation, even if usage overshoots", async () => {
    const user = await makeUser();
    const job = await runSummarize(db, user.id, { kind: "text", text: ARTICLE }, fixed(100_000, 100_000));
    expect(job.creditsCharged).toBe(job.creditsReserved);
  });

  it("refunds the whole reservation when the provider fails", async () => {
    const user = await makeUser();
    const job = await runSummarize(db, user.id, { kind: "text", text: `${ARTICLE} [fail]` }, new DemoProvider());
    expect(job).toMatchObject({ status: "failed", creditsCharged: 0 });
    expect(job.error).toMatch(/Demo provider failure/);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
    expect(await getBalance(db, SYSTEM.holds)).toBe(0);
  });

  it("refunds on unexpected errors too (not just provider errors)", async () => {
    const user = await makeUser();
    const boom: SummaryProvider = { name: "demo", summarize: async () => { throw new TypeError("bug"); } };
    const job = await runSummarize(db, user.id, { kind: "text", text: ARTICLE }, boom);
    expect(job.status).toBe("failed");
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
  });

  it("refuses to start when the balance cannot cover the reservation", async () => {
    const user = await makeUser();
    await holdCredits(db, { userId: user.id, jobId: crypto.randomUUID(), amount: SIGNUP_CREDITS - 3 });
    await expect(runSummarize(db, user.id, { kind: "text", text: ARTICLE }, new DemoProvider())).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    expect(await db.select().from(aiJobs)).toHaveLength(0); // no orphan job row
  });

  it(`rate-limits to ${RATE_LIMIT.jobs} jobs per minute per user, even under a parallel burst`, async () => {
    const user = await makeUser();
    const other = await makeUser();
    // Enough credits that only the rate limit can stop the burst.
    await adjustCredits(db, { userId: user.id, actorId: other.id, delta: 500, reason: "test", key: "rl" });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => runSummarize(db, user.id, { kind: "text", text: ARTICLE }, fixed(500, 100))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(RATE_LIMIT.jobs);
    expect(results.filter((r) => r.status === "rejected" && r.reason.code === "RATE_LIMITED")).toHaveLength(3);
    // Another user is unaffected.
    await expect(runSummarize(db, other.id, { kind: "text", text: ARTICLE }, fixed(500, 100))).resolves.toBeTruthy();
    // A minute later the user can run again.
    const later = new Date(Date.now() + RATE_LIMIT.windowMs + 1000);
    await expect(runSummarize(db, user.id, { kind: "text", text: ARTICLE }, fixed(500, 100), later)).resolves.toBeTruthy();
  });

  it("releases holds of jobs that never finished (crash recovery)", async () => {
    const user = await makeUser();
    const hang: SummaryProvider = { name: "demo", summarize: () => new Promise(() => {}) };
    void runSummarize(db, user.id, { kind: "text", text: ARTICLE }, hang);
    await expect.poll(async () => (await db.select().from(aiJobs)).length).toBe(1);
    expect(await getUserBalance(db, user.id)).toBeLessThan(SIGNUP_CREDITS);
    expect(await releaseStaleJobs(db, new Date(Date.now() + 11 * 60_000))).toBe(1);
    const [job] = await db.select().from(aiJobs).where(eq(aiJobs.userId, user.id));
    expect(job).toMatchObject({ status: "failed", error: "Timed out" });
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
  });

  it("validates input size", async () => {
    const user = await makeUser();
    await expect(runSummarize(db, user.id, { kind: "text", text: "too short" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(runSummarize(db, user.id, { kind: "text", text: "x".repeat(20_001) })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("demo provider", () => {
  it("returns a summary and a table of extracted facts", async () => {
    const { output } = await new DemoProvider().summarize(ARTICLE);
    expect(output.title).toBe("Quarterly update");
    expect(output.summary.length).toBeGreaterThan(40);
    const values = output.table.rows.map((r) => r[1]);
    expect(values).toEqual(expect.arrayContaining(["18%", "$4.2 million", "$500,000"]));
  });
});

describe("URL fetching (SSRF guard)", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"])(
    "treats %s as private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it("treats public addresses as public", () => {
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
  it.each(["http://localhost:3101/admin", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "http://user:pw@example.com"])(
    "refuses %s",
    async (url) => {
      await expect(fetchUrlText(url)).rejects.toBeInstanceOf(ProviderError);
    },
  );
});
