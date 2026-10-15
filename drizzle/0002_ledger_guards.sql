-- Database-level guarantees for the credit ledger. Application code already
-- validates all of this; the triggers make it impossible to bypass.

-- 1. Every transaction must sum to zero. Deferred to COMMIT so a transaction
--    can insert its entries one by one.
CREATE FUNCTION ledger_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total
    FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced (sum = %)', NEW.transaction_id, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();
--> statement-breakpoint

-- 2. A user's credit balance can never end a transaction below zero.
CREATE FUNCTION ledger_check_user_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_kind ledger_account_kind;
  balance bigint;
BEGIN
  SELECT kind INTO account_kind FROM ledger_accounts WHERE id = NEW.account_id;
  IF account_kind = 'user' THEN
    SELECT COALESCE(SUM(amount), 0) INTO balance
      FROM ledger_entries WHERE account_id = NEW.account_id;
    IF balance < 0 THEN
      RAISE EXCEPTION 'ledger account % would go negative (balance = %)', NEW.account_id, balance
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_user_non_negative
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_user_balance();
--> statement-breakpoint

-- 3. Append-only: corrections are new, reversing transactions.
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; post a reversing transaction instead', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
--> statement-breakpoint
CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
--> statement-breakpoint

-- 4. System (contra) accounts. Credits are issued from and returned to these.
INSERT INTO ledger_accounts (code, kind) VALUES
  ('system:grants', 'system'),      -- free signup + monthly plan allowance
  ('system:sales', 'system'),       -- purchased credit packs (reversed on refund)
  ('system:holds', 'system'),       -- credits reserved for running AI jobs
  ('system:usage', 'system'),       -- credits consumed by AI jobs
  ('system:adjustments', 'system'); -- manual admin corrections
