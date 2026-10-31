-- Keep the pgcrypto helpers available to the SECURITY DEFINER checkout and
-- registration activation functions. A later checkout migration reset the
-- student's search_path and the success trigger also omitted extensions.
-- Put trusted extension functions ahead of public to avoid name shadowing.
BEGIN;

ALTER FUNCTION public.begin_student_registration_payment(
  uuid, text, text, text, text, text, text, integer, integer, text, text, text
) SET search_path = pg_catalog, extensions, public;

ALTER FUNCTION public.begin_vendor_registration_payment(uuid, text)
  SET search_path = pg_catalog, extensions, public;

ALTER FUNCTION public.apply_student_registration_payment_result()
  SET search_path = pg_catalog, extensions, public;

CREATE OR REPLACE FUNCTION public.get_admin_payment_directory(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  payment_reference text,
  provider text,
  payment_type text,
  amount numeric,
  currency text,
  status text,
  created_at timestamptz,
  user_full_name text,
  user_email text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer := COALESCE(p_limit, 20);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN (
    'pending', 'initiated', 'success', 'failed', 'cancelled',
    'reconciliation_required', 'partially_refunded', 'refunded'
  ) THEN
    RAISE EXCEPTION 'Invalid payment status filter' USING ERRCODE = '22023';
  END IF;

  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT payment.id, payment.payment_reference, payment.provider,
         payment.payment_type, payment.amount, payment.currency,
         payment.status, payment.created_at, profile.full_name,
         profile.email, count(*) OVER ()
  FROM public.payments AS payment
  LEFT JOIN public.profiles AS profile ON profile.id = payment.user_id
  WHERE p_status IS NULL OR payment.status = p_status
  ORDER BY payment.created_at DESC, payment.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_admin_payments(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count bigint;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN (
    'pending', 'initiated', 'success', 'failed', 'cancelled',
    'reconciliation_required', 'partially_refunded', 'refunded'
  ) THEN
    RAISE EXCEPTION 'Invalid payment status filter' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.payments AS payment
  WHERE p_status IS NULL OR payment.status = p_status;

  IF v_count > 5000 THEN
    RAISE EXCEPTION 'Export exceeds the 5000-record limit; apply a status filter' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'reference', payment.payment_reference,
        'provider', payment.provider,
        'type', payment.payment_type,
        'user', COALESCE(profile.full_name, profile.email),
        'amount', payment.amount,
        'currency', payment.currency,
        'status', payment.status,
        'created_at', payment.created_at
      ) ORDER BY payment.created_at DESC, payment.id
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM public.payments AS payment
  LEFT JOIN public.profiles AS profile ON profile.id = payment.user_id
  WHERE p_status IS NULL OR payment.status = p_status;

  PERFORM public.record_trusted_admin_action(
    'payments.export', 'payments', 'payments', NULL,
    jsonb_build_object('format', 'csv', 'status', p_status, 'record_count', v_count)
  );

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.apply_student_registration_payment_result() IS
  'Applies verified student registration payment outcomes; pgcrypto is resolved from the trusted extensions schema.';

COMMIT;
