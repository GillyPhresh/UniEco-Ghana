-- Payments RLS policies (payments.user_id already exists in DB)

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_payments" ON payments;
CREATE POLICY "user_select_own_payments"
ON payments FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_select_all_payments" ON payments;
CREATE POLICY "staff_select_all_payments"
ON payments FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "user_insert_own_payments" ON payments;
CREATE POLICY "user_insert_own_payments"
ON payments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_update_own_payments" ON payments;
CREATE POLICY "user_update_own_payments"
ON payments FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status IN ('pending', 'initiated'))
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_update_payments" ON payments;
CREATE POLICY "staff_update_payments"
ON payments FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "vendor_select_payments" ON payments;
CREATE POLICY "vendor_select_payments"
ON payments FOR SELECT TO authenticated
USING (
  vendor_id IS NOT NULL AND
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = payments.vendor_id AND vendors.owner_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(payment_reference);

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();