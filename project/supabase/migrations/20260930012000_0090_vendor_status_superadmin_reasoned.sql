-- Vendor activation is a platform-level control: only super-admins may use it.
-- Both suspension and restoration require a reason and trusted audit evidence.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_vendor_active(
  p_vendor_id uuid,
  p_is_active boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS NULL OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor not found' USING ERRCODE = 'P0002'; END IF;
  IF v_vendor.is_active = p_is_active THEN
    RAISE EXCEPTION 'Vendor status is already set; refresh and review again' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendors SET is_active = p_is_active, updated_at = now()
  WHERE id = v_vendor.id;

  PERFORM public.record_trusted_admin_action(
    CASE WHEN p_is_active THEN 'vendor.reactivated' ELSE 'vendor.suspended' END,
    'vendors', 'vendor', v_vendor.id,
    jsonb_build_object(
      'reason', v_reason,
      'university_id', v_vendor.university_id,
      'previous_is_active', v_vendor.is_active,
      'current_is_active', p_is_active
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_vendor_active(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_vendor_active(uuid, boolean, text) TO authenticated;

COMMIT;
