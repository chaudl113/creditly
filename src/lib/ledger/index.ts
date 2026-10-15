import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  type LedgerTxType,
} from "@/db/schema";
import { AppError } from "@/lib/errors";

/** Contra accounts created by migration 0002. */
export const SYSTEM = {
  grants: "system:grants",
  sales: "system:sales",
  holds: "system:holds",
  usage: "system:usage",
  adjustments: "system:adjustments",
} as const;
export type SystemAccount = (typeof SYSTEM)[keyof typeof SYSTEM];

export const userAccountCode = (userId: string) => `user:${userId}`;

export type Posting = {
  /** Account code: `user:<uuid>` or one of SYSTEM. */
  account: string;
  /** Integer credits; positive increases the account. */
  amount: number;
};

export type PostInput = {
  type: LedgerTxType;
  idempotencyKey: string;
  memo: string;
  userId?: string | null;
  actorId?: string | null;
  ref?: string | null;
  postings: Posting[];
};

export type PostResult = { transactionId: string; duplicate: boolean };

/** Pure validation, run before touching the database. */
export function validatePostings(postings: Posting[]): void {
  if (postings.length < 2) throw new AppError("VALIDATION", "A transaction needs at least two postings");
  for (const p of postings) {
    if (!Number.isSafeInteger(p.amount) || p.amount === 0) {
      throw new AppError("VALIDATION", `Posting amount must be a non-zero integer, got ${p.amount}`);
    }
  }
  const sum = postings.reduce((acc, p) => acc + p.amount, 0);
  if (sum !== 0) throw new AppError("VALIDATION", `Postings must sum to zero, got ${sum}`);
}

export async function ensureUserAccount(db: DbOrTx, userId: string): Promise<void> {
  await db
    .insert(ledgerAccounts)
    .values({ code: userAccountCode(userId), kind: "user", userId })
    .onConflictDoNothing({ target: ledgerAccounts.code });
}

/**
 * Posts a balanced transaction atomically.
 *
 * - Idempotent: a second call with the same key returns the first
 *   transaction and posts nothing (safe for webhook retries).
 * - User accounts involved are locked (SELECT … FOR UPDATE) and their
 *   balance re-checked inside the lock, so concurrent spends serialise and a
 *   balance can never go below zero. The DB triggers are the backstop.
 */
export async function postTransaction(db: DbOrTx, input: PostInput): Promise<PostResult> {
  validatePostings(input.postings);

  return db.transaction(async (tx) => {
    const codes = [...new Set(input.postings.map((p) => p.account))];
    const accounts = await tx
      .select({ id: ledgerAccounts.id, code: ledgerAccounts.code, kind: ledgerAccounts.kind })
      .from(ledgerAccounts)
      .where(inArray(ledgerAccounts.code, codes));
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    for (const code of codes) {
      if (!byCode.has(code)) throw new AppError("NOT_FOUND", `Unknown ledger account ${code}`);
    }
    // Lock only the user wallets involved, in a stable order (no deadlocks).
    // System accounts are never locked, so they are not a global bottleneck.
    await lockUserAccounts(
      tx,
      accounts.filter((a) => a.kind === "user").map((a) => a.code),
    );

    // Idempotency check happens after the lock so a concurrent duplicate
    // waits here and then sees the committed first attempt.
    const [inserted] = await tx
      .insert(ledgerTransactions)
      .values({
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        memo: input.memo,
        userId: input.userId ?? null,
        actorId: input.actorId ?? null,
        ref: input.ref ?? null,
      })
      .onConflictDoNothing({ target: ledgerTransactions.idempotencyKey })
      .returning({ id: ledgerTransactions.id });

    if (!inserted) {
      const [existing] = await tx
        .select({ id: ledgerTransactions.id })
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey));
      return { transactionId: existing.id, duplicate: true };
    }

    // Net effect per user account; reject overdrafts with a clear error.
    const net = new Map<string, number>();
    for (const p of input.postings) net.set(p.account, (net.get(p.account) ?? 0) + p.amount);
    for (const [code, delta] of net) {
      const account = byCode.get(code)!;
      if (account.kind !== "user" || delta >= 0) continue;
      const balance = await balanceOfAccount(tx, account.id);
      if (balance + delta < 0) {
        throw new AppError(
          "INSUFFICIENT_CREDITS",
          `Not enough credits: balance ${balance}, needed ${-delta}`,
        );
      }
    }

    await tx.insert(ledgerEntries).values(
      input.postings.map((p) => ({
        transactionId: inserted.id,
        accountId: byCode.get(p.account)!.id,
        amount: p.amount,
      })),
    );
    return { transactionId: inserted.id, duplicate: false };
  });
}

export async function lockUserAccounts(db: DbOrTx, codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await db
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(inArray(ledgerAccounts.code, [...codes].sort()))
    .orderBy(ledgerAccounts.code)
    .for("update");
}

async function balanceOfAccount(db: DbOrTx, accountId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId));
  return Number(row.balance);
}

/** Balance = sum of entries. There is no balance column to drift. */
export async function getBalance(db: DbOrTx, accountCode: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(eq(ledgerAccounts.code, accountCode));
  return Number(row.balance);
}

export const getUserBalance = (db: DbOrTx, userId: string) => getBalance(db, userAccountCode(userId));

/** Every account's balance; the grand total must always be 0. */
export async function trialBalance(db: DbOrTx) {
  const rows = await db
    .select({
      code: ledgerAccounts.code,
      kind: ledgerAccounts.kind,
      balance: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)`,
    })
    .from(ledgerAccounts)
    .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, ledgerAccounts.id))
    .groupBy(ledgerAccounts.code, ledgerAccounts.kind)
    .orderBy(ledgerAccounts.code);
  const accounts = rows.map((r) => ({ ...r, balance: Number(r.balance) }));
  const total = accounts.reduce((acc, a) => acc + a.balance, 0);
  const userCredits = accounts.filter((a) => a.kind === "user").reduce((acc, a) => acc + a.balance, 0);
  const system = accounts.filter((a) => a.kind === "system");
  return { total, userCredits, system };
}

/** A user's statement: each transaction with the user's side of it. */
export async function userStatement(db: DbOrTx, userId: string, limit = 50) {
  return db
    .select({
      id: ledgerTransactions.id,
      type: ledgerTransactions.type,
      memo: ledgerTransactions.memo,
      ref: ledgerTransactions.ref,
      createdAt: ledgerTransactions.createdAt,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(and(eq(ledgerAccounts.code, userAccountCode(userId))))
    .orderBy(desc(ledgerTransactions.createdAt), desc(ledgerEntries.id))
    .limit(limit);
}

/** Recent transactions with all their entries (admin ledger view). */
export async function recentTransactions(db: DbOrTx, limit = 50) {
  const txs = await db
    .select()
    .from(ledgerTransactions)
    .orderBy(desc(ledgerTransactions.createdAt))
    .limit(limit);
  if (txs.length === 0) return [];
  const entries = await db
    .select({
      transactionId: ledgerEntries.transactionId,
      account: ledgerAccounts.code,
      amount: ledgerEntries.amount,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
    .where(inArray(ledgerEntries.transactionId, txs.map((t) => t.id)))
    .orderBy(ledgerEntries.id);
  return txs.map((t) => ({ ...t, entries: entries.filter((e) => e.transactionId === t.id) }));
}
