-- RLS for refunds, transaction_audit_log, payment_status_history, and receipts

-- =====================================================================
-- REFUNDS
-- =====================================================================
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_refunds" ON refunds;
CREATE POLICY "user_select_own_refunds"
ON refunds FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_select_all_refunds" ON refunds;
CREATE POLICY "staff_select_all_refunds"
ON refunds FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_insert_own_refunds" ON refunds;
CREATE POLICY "user_insert_own_refunds"
ON refunds FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND auth.uid() = requested_by);

DROP POLICY IF EXISTS "staff_update_refunds" ON refunds;
CREATE POLICY "staff_update_refunds"
ON refunds FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- TRANSACTION_AUDIT_LOG (immutable)
-- =====================================================================
ALTER TABLE transaction_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_tx_audit" ON transaction_audit_log;
CREATE POLICY "user_select_own_tx_audit"
ON transaction_audit_log FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM payments WHERE payments.id = transaction_audit_log.payment_id AND payments.user_id = auth.uid())
);

DROP POLICY IF EXISTS "staff_select_all_tx_audit" ON transaction_audit_log;
CREATE POLICY "staff_select_all_tx_audit"
ON transaction_audit_log FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_tx_audit" ON transaction_audit_log;
CREATE POLICY "staff_insert_tx_audit"
ON transaction_audit_log FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- PAYMENT_STATUS_HISTORY (immutable)
-- =====================================================================
ALTER TABLE payment_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_payment_history" ON payment_status_history;
CREATE POLICY "user_select_own_payment_history"
ON payment_status_history FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM payments WHERE payments.id = payment_status_history.payment_id AND payments.user_id = auth.uid())
);

DROP POLICY IF EXISTS "staff_select_all_payment_history" ON payment_status_history;
CREATE POLICY "staff_select_all_payment_history"
ON payment_status_history FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_insert_payment_history" ON payment_status_history;
CREATE POLICY "staff_insert_payment_history"
ON payment_status_history FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- RECEIPTS (extend existing RLS)
-- =====================================================================
DROP POLICY IF EXISTS "user_select_own_receipts" ON receipts;
CREATE POLICY "user_select_own_receipts"
ON receipts FOR SELECT TO authenticated
USING (auth.uid() = user_id OR auth.uid() = COALESCE(NULL, (SELECT buyer_id FROM orders WHERE orders.id = receipts.order_id)));

DROP POLICY IF EXISTS "vendor_select_receipts" ON receipts;
CREATE POLICY "vendor_select_receipts"
ON receipts FOR SELECT TO authenticated
USING (
  vendor_id IS NOT NULL AND
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = receipts.vendor_id AND vendors.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "staff_select_all_receipts" ON receipts;
CREATE POLICY "staff_select_all_receipts"
ON receipts FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_insert_own_receipts" ON receipts;
CREATE POLICY "user_insert_own_receipts"
ON receipts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_insert_receipts" ON receipts;
CREATE POLICY "staff_insert_receipts"
ON receipts FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

-- =====================================================================
-- REFUND NUMBER GENERATOR
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_refund_number()
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
    SELECT substring(refund_number from '\d+$')::int AS seq_val
    FROM refunds
    WHERE refund_number LIKE 'RFD-' || date_part || '-%'
  ) sub;
  result := 'RFD-' || date_part || '-' || lpad(seq::text, 4, '0');
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_refund_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_refund_number() TO authenticated;

-- =====================================================================
-- TRIGGERS
-- =====================================================================
DROP TRIGGER IF EXISTS trg_refunds_updated ON refunds;
CREATE TRIGGER trg_refunds_updated BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();