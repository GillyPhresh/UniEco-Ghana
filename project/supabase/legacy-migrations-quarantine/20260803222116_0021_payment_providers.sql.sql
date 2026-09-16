-- Test: just create the payment_providers table
CREATE TABLE IF NOT EXISTS payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  supported_methods text[] NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payment_providers (name, display_name, is_enabled, supported_methods, config, sort_order)
VALUES
  ('hubtel', 'Hubtel Mobile Money', false, ARRAY['mtn_momo', 'vodafone_cash', 'airteltigo_money', 'visa', 'mastercard'], '{}'::jsonb, 1),
  ('paystack', 'Paystack', false, ARRAY['mtn_momo', 'vodafone_cash', 'airteltigo_money', 'visa', 'mastercard'], '{}'::jsonb, 2),
  ('flutterwave', 'Flutterwave', false, ARRAY['mtn_momo', 'vodafone_cash', 'airteltigo_money', 'visa', 'mastercard'], '{}'::jsonb, 3),
  ('manual', 'Manual / Bank Transfer', true, ARRAY['bank_transfer'], '{}'::jsonb, 99)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_payment_providers" ON payment_providers;
CREATE POLICY "staff_select_payment_providers"
ON payment_providers FOR SELECT TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));

DROP POLICY IF EXISTS "staff_manage_payment_providers" ON payment_providers;
CREATE POLICY "staff_manage_payment_providers"
ON payment_providers FOR ALL TO authenticated
USING (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'))
WITH CHECK (auth.jwt() ->> 'role' IN ('moderator', 'super_admin'));