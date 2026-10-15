import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // stored lower-cased
  name: text("name").notNull(),
  passwordHash: text("password_hash"), // null for OAuth-only accounts
  role: roleEnum("role").notNull().default("user"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  // Sessions issued before this moment are rejected (password reset).
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(), // sha256 of the emailed token
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Credit ledger (double-entry). Balances are never stored: an account's
// balance is SUM(amount) of its entries. Every transaction sums to zero —
// enforced in code and by a deferred constraint trigger (see drizzle/0002).
// Entries and transactions are append-only (UPDATE/DELETE raise).
// ---------------------------------------------------------------------------

export const accountKindEnum = pgEnum("ledger_account_kind", ["user", "system"]);

export const ledgerAccounts = pgTable("ledger_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // "user:<uuid>" or "system:<name>"
  kind: accountKindEnum("kind").notNull(),
  userId: uuid("user_id")
    .unique()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerTxTypeEnum = pgEnum("ledger_tx_type", [
  "signup_grant",
  "plan_grant",
  "purchase",
  "usage_hold",
  "usage_settle",
  "usage_release",
  "manual_adjustment",
  "refund_clawback",
]);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: ledgerTxTypeEnum("type").notNull(),
    // Natural key of the business event (e.g. "invoice:in_123:grant").
    // Replaying the same event can never post twice.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    userId: uuid("user_id").references(() => users.id), // the user this concerns
    actorId: uuid("actor_id").references(() => users.id), // admin who posted it, if manual
    memo: text("memo").notNull(),
    ref: text("ref"), // ai job id, stripe object id, ...
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_transactions_user_idx").on(t.userId, t.createdAt)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id),
    amount: integer("amount").notNull(), // credits; + increases the account
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ledger_entries_amount_nonzero", sql`${t.amount} <> 0`),
    index("ledger_entries_account_idx").on(t.accountId),
    index("ledger_entries_tx_idx").on(t.transactionId),
  ],
);

export type User = typeof users.$inferSelect;
export type LedgerTxType = (typeof ledgerTxTypeEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
