-- RLS policies for invoices, invoice_items, referrals, referral_rewards, wallets, wallet_transactions
-- + indexes + functions + triggers

-- =====================================================================
-- RLS — INVOICES
-- =====================================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_invoices" ON invoices;
CREATE POLICY "user_select_own_invoices"
ON invoices FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_select_all_invoices" ON invoices;
CREATE POLICY "staff_select_all_invoices"
ON invoices FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "vendor_select_own_invoices" ON invoices;
CREATE POLICY "vendor_select_own_invoices"
ON invoices FOR SELECT TO authenticated
USING (
  vendor_id IS NOT NULL AND
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = invoices.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "user_insert_own_invoices" ON invoices;
CREATE POLICY "user_insert_own_invoices"
ON invoices FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_insert_invoices" ON invoices;
CREATE POLICY "staff_insert_invoices"
ON invoices FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_invoices" ON invoices;
CREATE POLICY "staff_update_invoices"
ON invoices FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- RLS — INVOICE_ITEMS
-- =====================================================================
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_invoice_items" ON invoice_items;
CREATE POLICY "user_select_own_invoice_items"
ON invoice_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()));

DROP POLICY IF EXISTS "staff_select_all_invoice_items" ON invoice_items;
CREATE POLICY "staff_select_all_invoice_items"
ON invoice_items FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_insert_own_invoice_items" ON invoice_items;
CREATE POLICY "user_insert_own_invoice_items"
ON invoice_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid()));

DROP POLICY IF EXISTS "staff_insert_invoice_items" ON invoice_items;
CREATE POLICY "staff_insert_invoice_items"
ON invoice_items FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- =====================================================================
-- RLS — REFERRALS
-- =====================================================================
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_referrals" ON referrals;
CREATE POLICY "user_select_own_referrals"
ON referrals FOR SELECT TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "staff_select_all_referrals" ON referrals;
CREATE POLICY "staff_select_all_referrals"
ON referrals FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_insert_own_referrals" ON referrals;
CREATE POLICY "user_insert_own_referrals"
ON referrals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "staff_update_referrals" ON referrals;
CREATE POLICY "staff_update_referrals"
ON referrals FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- =====================================================================
-- RLS — REFERRAL_REWARDS
-- =====================================================================
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_rewards" ON referral_rewards;
CREATE POLICY "user_select_own_rewards"
ON referral_rewards FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_select_all_rewards" ON referral_rewards;
CREATE POLICY "staff_select_all_rewards"
ON referral_rewards FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_rewards" ON referral_rewards;
CREATE POLICY "staff_insert_rewards"
ON referral_rewards FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referral ON referral_rewards(referral_id);

-- =====================================================================
-- RLS — WALLETS
-- =====================================================================
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_wallet" ON wallets;
CREATE POLICY "user_select_own_wallet"
ON wallets FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_select_all_wallets" ON wallets;
CREATE POLICY "staff_select_all_wallets"
ON wallets FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_wallets" ON wallets;
CREATE POLICY "staff_insert_wallets"
ON wallets FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_wallets" ON wallets;
CREATE POLICY "staff_update_wallets"
ON wallets FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

DROP TRIGGER IF EXISTS trg_wallets_updated ON wallets;
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- RLS — WALLET_TRANSACTIONS
-- =====================================================================
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_wallet_transactions" ON wallet_transactions;
CREATE POLICY "user_select_own_wallet_transactions"
ON wallet_transactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM wallets WHERE wallets.id = wallet_transactions.wallet_id AND wallets.user_id = auth.uid()));

DROP POLICY IF EXISTS "staff_select_all_wallet_transactions" ON wallet_transactions;
CREATE POLICY "staff_select_all_wallet_transactions"
ON wallet_transactions FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_wallet_transactions" ON wallet_transactions;
CREATE POLICY "staff_insert_wallet_transactions"
ON wallet_transactions FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions(created_at DESC);

-- =====================================================================
-- FUNCTIONS
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_payment_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  date_part text;
  seq int;
  result text;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');
  SELECT COALESCE(MAX(seq_val), 0) + 1 INTO seq
  FROM (
    SELECT substring(payment_reference from '\d+$')::int AS seq_val
    FROM payments
    WHERE payment_reference LIKE 'PAY-' || date_part || '-%'
  ) sub;
  result := 'PAY-' || date_part || '-' || lpad(seq::text, 4, '0');
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_payment_reference() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_payment_reference() TO authenticated;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  date_part text;
  seq int;
  result text;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');
  SELECT COALESCE(MAX(seq_val), 0) + 1 INTO seq
  FROM (
    SELECT substring(invoice_number from '\d+$')::int AS seq_val
    FROM invoices
    WHERE invoice_number LIKE 'INV-' || date_part || '-%'
  ) sub;
  result := 'INV-' || date_part || '-' || lpad(seq::text, 4, '0');
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_invoice_number() TO authenticated;

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i int;
  exists bool;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM referrals WHERE referral_code = result) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_referral_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_referral_code() TO authenticated;