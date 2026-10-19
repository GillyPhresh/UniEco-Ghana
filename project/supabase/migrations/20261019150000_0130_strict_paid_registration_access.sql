-- Make registration access depend on the matching, verified registration
-- record and payment state. Staff roles remain explicitly exempt.
BEGIN;

CREATE OR REPLACE FUNCTION public.apply_vendor_registration_payment_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.payment_type <> 'vendor_registration'
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'success' THEN
    IF NEW.amount = (SELECT vendor_registration_fee FROM public.student_financial_settings WHERE singleton)
       AND NEW.currency = 'GHS'
       AND NEW.vendor_id IS NOT NULL THEN
      UPDATE public.vendor_registration_payment_states
      SET payment_requirement = 'paid',
          state = 'paid',
          payment_id = NEW.id,
          amount = NEW.amount,
          currency = NEW.currency,
          updated_at = now()
      WHERE vendor_id = NEW.vendor_id AND owner_id = NEW.user_id;

      -- Payment unlocks the account. Vendor verification and public listing
      -- remain separate review decisions and are not auto-approved here.
      UPDATE public.profiles
      SET status = 'active', is_active = true, updated_at = now()
      WHERE id = NEW.user_id;
    END IF;
  ELSIF NEW.status IN ('failed', 'cancelled', 'refunded', 'partially_refunded') THEN
    UPDATE public.vendor_registration_payment_states
    SET payment_requirement = 'required',
        state = 'awaiting_payment',
        updated_at = now()
    WHERE vendor_id = NEW.vendor_id AND owner_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_registration_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  role_name text := public.current_app_role();
  required_amount numeric(12,2);
  paid boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'role', NULL, 'required_amount', NULL, 'status', 'unauthenticated');
  END IF;

  IF role_name IN ('moderator', 'super_admin', 'university_admin') THEN
    RETURN jsonb_build_object('allowed', true, 'role', role_name, 'required_amount', 0, 'status', 'staff_exempt');
  END IF;

  IF role_name = 'student' THEN
    SELECT registration_fee INTO required_amount
    FROM public.student_financial_settings WHERE singleton;

    paid := EXISTS (
      SELECT 1
      FROM public.student_registration_payments registration
      JOIN public.payments payment ON payment.user_id = registration.user_id
        AND payment.payment_type = 'student_registration'
        AND payment.entity_id = registration.user_id
        AND payment.status = 'success'
        AND payment.amount = required_amount
        AND payment.currency = 'GHS'
      WHERE registration.user_id = uid
        AND registration.status = 'paid'
    );
  ELSIF role_name IN ('student_vendor', 'external_vendor') THEN
    SELECT vendor_registration_fee INTO required_amount
    FROM public.student_financial_settings WHERE singleton;

    paid := EXISTS (
      SELECT 1
      FROM public.vendors vendor
      JOIN public.vendor_registration_payment_states state
        ON state.vendor_id = vendor.id AND state.owner_id = uid AND state.state = 'paid'
      JOIN public.payments payment
        ON payment.id = state.payment_id
        AND payment.user_id = uid
        AND payment.vendor_id = vendor.id
        AND payment.payment_type = 'vendor_registration'
        AND payment.status = 'success'
        AND payment.amount = required_amount
        AND payment.currency = 'GHS'
      WHERE vendor.owner_id = uid
    );
  ELSE
    RETURN jsonb_build_object('allowed', false, 'role', role_name, 'required_amount', NULL, 'status', 'registration_required');
  END IF;

  RETURN jsonb_build_object(
    'allowed', paid,
    'role', role_name,
    'required_amount', required_amount,
    'currency', 'GHS',
    'status', CASE WHEN paid THEN 'paid' ELSE 'payment_required' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vendor_registration_payment_result() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_registration_access() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_registration_access() TO authenticated;

COMMIT;
