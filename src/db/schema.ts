import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
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

// ---------------------------------------------------------------------------
// Billing (Stripe). Stripe is the source of truth for money; these tables are
// the app's projection of it, built only from verified webhook events.
// ---------------------------------------------------------------------------

export const checkoutKindEnum = pgEnum("checkout_kind", ["subscription", "credit_pack"]);

export const checkoutSessions = pgTable("checkout_sessions", {
  id: text("id").primaryKey(), // Stripe cs_...
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  kind: checkoutKindEnum("kind").notNull(),
  productKey: text("product_key").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["open", "completed"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // Stripe sub_...
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    planKey: text("plan_key").notNull(),
    status: text("status").notNull(), // Stripe status: active, past_due, canceled, ...
    priceCents: integer("price_cents").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    // `created` of the newest Stripe event applied. Older events are ignored,
    // which makes subscription state immune to out-of-order delivery.
    stripeEventAt: timestamp("stripe_event_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeRef: text("stripe_ref").notNull().unique(), // invoice in_... or checkout cs_...
    paymentIntentId: text("payment_intent_id").unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: checkoutKindEnum("kind").notNull(),
    productKey: text("product_key").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    creditsGranted: integer("credits_granted").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_user_idx").on(t.userId), index("payments_paid_at_idx").on(t.paidAt)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey(), // Stripe re_..., or charge:<ch>:<cumulative> from charge.refunded
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    amountCents: integer("amount_cents").notNull(),
    creditsReclaimed: integer("credits_reclaimed").notNull(),
    reason: text("reason").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("refunds_amount_positive", sql`${t.amountCents} > 0`)],
);

export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(), // evt_... — the idempotency key for webhooks
    type: text("type").notNull(),
    stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["pending", "processed", "ignored", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    deliveries: integer("deliveries").notNull().default(1),
    note: text("note"),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("stripe_events_received_idx").on(t.receivedAt)],
);

// ---------------------------------------------------------------------------
// AI jobs. Each job reserves credits up front (usage_hold), then is closed
// exactly once: settled at the real token cost, or released in full on error.
// ---------------------------------------------------------------------------

export const aiJobStatusEnum = pgEnum("ai_job_status", ["running", "succeeded", "failed"]);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: aiJobStatusEnum("status").notNull().default("running"),
    source: text("source", { enum: ["text", "url"] }).notNull(),
    sourceUrl: text("source_url"),
    inputChars: integer("input_chars").notNull(),
    provider: text("provider", { enum: ["anthropic", "demo"] }).notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    creditsReserved: integer("credits_reserved").notNull(),
    creditsCharged: integer("credits_charged"),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("ai_jobs_user_created_idx").on(t.userId, t.createdAt), index("ai_jobs_status_idx").on(t.status)],
);

export type User = typeof users.$inferSelect;
export type AiJob = typeof aiJobs.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type LedgerTxType = (typeof ledgerTxTypeEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
