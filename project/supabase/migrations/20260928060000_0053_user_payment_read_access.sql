BEGIN;

-- Let signed-in customers view only their own authoritative payment records.
-- Payment creation, provider status, and fulfillment remain server-controlled.
DROP POLICY IF EXISTS users_select_own_payments ON public.payments;
CREATE POLICY users_select_own_payments ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMIT;
