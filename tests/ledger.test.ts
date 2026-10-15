import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { SIGNUP_CREDITS } from "@/lib/billing/catalog";
import {
  adjustCredits,
  clawbackCredits,
  creditPurchase,
  holdCredits,
  releaseHold,
  settleHold,
} from "@/lib/credits";
import { AppError } from "@/lib/errors";
import {
  SYSTEM,
  getBalance,
  getUserBalance,
  postTransaction,
  trialBalance,
  userAccountCode,
} from "@/lib/ledger";
import { dbError, makeUser, resetDb, testDb } from "./helpers";

const db = testDb();
beforeEach(() => resetDb());

async function expectBooksBalanced() {
  const tb = await trialBalance(db);
  expect(tb.total).toBe(0);
  return tb;
}

describe("double-entry ledger", () => {
  it("gives a new user the signup credits and keeps the books at zero", async () => {
    const user = await makeUser();
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
    const tb = await expectBooksBalanced();
    expect(tb.userCredits).toBe(SIGNUP_CREDITS);
  });

  it.each([
    { name: "unbalanced", postings: [{ amount: 10 }, { amount: -9 }] },
    { name: "fractional", postings: [{ amount: 1.5 }, { amount: -1.5 }] },
    { name: "zero amount", postings: [{ amount: 0 }, { amount: 0 }] },
    { name: "single posting", postings: [{ amount: 0 }] },
  ])("rejects a $name transaction before writing anything", async ({ postings }) => {
    const user = await makeUser();
    const accounts = [userAccountCode(user.id), SYSTEM.adjustments];
    await expect(
      postTransaction(db, {
        type: "manual_adjustment",
        idempotencyKey: "bad",
        memo: "bad",
        postings: postings.map((p, i) => ({ account: accounts[i], amount: p.amount })),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
  });

  it("database rejects an unbalanced transaction even when code is bypassed", async () => {
    const user = await makeUser();
    await expect(
      db.transaction(async (tx) => {
        const [t] = await tx.execute<{ id: string }>(sql`
          INSERT INTO ledger_transactions (type, idempotency_key, memo)
          VALUES ('manual_adjustment', 'raw-unbalanced', 'raw') RETURNING id`);
        await tx.execute(sql`
          INSERT INTO ledger_entries (transaction_id, account_id, amount)
          SELECT ${t.id}, id, 1000 FROM ledger_accounts WHERE code = ${userAccountCode(user.id)}`);
      }),
    ).rejects.toThrow(/unbalanced/);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
    await expectBooksBalanced();
  });

  it("database rejects a balanced transaction that overdraws a user", async () => {
    const user = await makeUser();
    await expect(
      db.transaction(async (tx) => {
        const [t] = await tx.execute<{ id: string }>(sql`
          INSERT INTO ledger_transactions (type, idempotency_key, memo)
          VALUES ('usage_hold', 'raw-overdraft', 'raw') RETURNING id`);
        await tx.execute(sql`
          INSERT INTO ledger_entries (transaction_id, account_id, amount)
          SELECT ${t.id}, id, CASE WHEN kind = 'user' THEN -51 ELSE 51 END
          FROM ledger_accounts WHERE code IN (${userAccountCode(user.id)}, ${SYSTEM.holds})`);
      }),
    ).rejects.toThrow(/negative/);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
  });

  it("is append-only: entries and transactions cannot be edited or deleted", async () => {
    await makeUser();
    expect(await dbError(db.execute(sql`UPDATE ledger_entries SET amount = amount * 10`))).toMatch(/append-only/);
    expect(await dbError(db.execute(sql`DELETE FROM ledger_entries`))).toMatch(/append-only/);
    expect(await dbError(db.execute(sql`UPDATE ledger_transactions SET memo = 'x'`))).toMatch(/append-only/);
  });

  it("refuses to spend more credits than the balance", async () => {
    const user = await makeUser();
    const attempt = holdCredits(db, { userId: user.id, jobId: crypto.randomUUID(), amount: SIGNUP_CREDITS + 1 });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
  });

  it("serialises concurrent spends: 20 parallel holds of 5 on a balance of 50 → exactly 10 succeed", async () => {
    const user = await makeUser();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => holdCredits(db, { userId: user.id, jobId: crypto.randomUUID(), amount: 5 })),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const insufficient = results.filter(
      (r) => r.status === "rejected" && (r.reason as AppError).code === "INSUFFICIENT_CREDITS",
    ).length;
    expect(ok).toBe(10);
    expect(insufficient).toBe(10);
    expect(await getUserBalance(db, user.id)).toBe(0);
    expect(await getBalance(db, SYSTEM.holds)).toBe(50);
    await expectBooksBalanced();
  });

  it("is idempotent: the same purchase posted 5 times concurrently credits once", async () => {
    const user = await makeUser();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        creditPurchase(db, { userId: user.id, paymentRef: "pi_same", credits: 500, packName: "500 pack" }),
      ),
    );
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS + 500);
  });

  it("settles a job: charges the actual cost and returns the rest of the hold", async () => {
    const user = await makeUser();
    const jobId = crypto.randomUUID();
    await holdCredits(db, { userId: user.id, jobId, amount: 10 });
    expect(await getUserBalance(db, user.id)).toBe(40);
    await settleHold(db, { userId: user.id, jobId, reserved: 10, charged: 3 });
    expect(await getUserBalance(db, user.id)).toBe(47);
    expect(await getBalance(db, SYSTEM.holds)).toBe(0);
    expect(await getBalance(db, SYSTEM.usage)).toBe(3);
    await expectBooksBalanced();
  });

  it("never charges more than was reserved", async () => {
    const user = await makeUser();
    const jobId = crypto.randomUUID();
    await holdCredits(db, { userId: user.id, jobId, amount: 5 });
    expect(() => settleHold(db, { userId: user.id, jobId, reserved: 5, charged: 6 })).toThrow(/within the reservation/);
  });

  it("refunds a failed job in full, and a job can be closed only once", async () => {
    const user = await makeUser();
    const jobId = crypto.randomUUID();
    await holdCredits(db, { userId: user.id, jobId, amount: 8 });
    await releaseHold(db, { userId: user.id, jobId, reserved: 8, reason: "provider error" });
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
    // A late "success" for the same job must not return the credits again.
    const late = await settleHold(db, { userId: user.id, jobId, reserved: 8, charged: 2 });
    expect(late.duplicate).toBe(true);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
    await expectBooksBalanced();
  });

  it("claws back refunded credits, capped at what the user still holds", async () => {
    const user = await makeUser();
    await creditPurchase(db, { userId: user.id, paymentRef: "pi_1", credits: 500, packName: "500 pack" });
    await holdCredits(db, { userId: user.id, jobId: crypto.randomUUID(), amount: 400 }); // spent
    const taken = await clawbackCredits(db, { userId: user.id, refundKey: "re_1", credits: 500, memo: "refund" });
    expect(taken).toBe(150);
    expect(await getUserBalance(db, user.id)).toBe(0);
    expect(await clawbackCredits(db, { userId: user.id, refundKey: "re_1", credits: 500, memo: "refund" })).toBe(0);
    await expectBooksBalanced();
  });

  it("admin adjustments cannot push a wallet below zero", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "admin" });
    await adjustCredits(db, { userId: user.id, actorId: admin.id, delta: 25, reason: "goodwill", key: "a1" });
    expect(await getUserBalance(db, user.id)).toBe(75);
    await expect(
      adjustCredits(db, { userId: user.id, actorId: admin.id, delta: -76, reason: "oops", key: "a2" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(await getUserBalance(db, user.id)).toBe(75);
  });
});
