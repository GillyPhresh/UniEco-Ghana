BEGIN;

-- Pending vendors are private. They are visible only to their owner and to
-- the authorized verification queue; the existing public policy continues to
-- expose active vendors only.
DROP POLICY IF EXISTS vendors_select_owner_or_verification_reviewer ON public.vendors;
CREATE POLICY vendors_select_owner_or_verification_reviewer ON public.vendors
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_permission('can_review_verifications')
  );

CREATE OR REPLACE FUNCTION public.review_vendor_verification(
  p_vendor_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_user_id uuid;
BEGIN
  IF NOT (public.is_super_admin() OR public.has_permission('can_review_verifications')) THEN
    RAISE EXCEPTION 'Not authorized to review vendor verification' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO target_user_id FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor does not exist' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.vendors SET is_verified = p_approved WHERE id = p_vendor_id;
  UPDATE public.vendor_profiles
  SET verification_status = CASE WHEN p_approved THEN 'active' ELSE 'rejected' END,
      approved_at = CASE WHEN p_approved THEN now() ELSE NULL END,
      approved_by = CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE NULLIF(trim(p_reason), '') END
  WHERE profile_id = target_user_id;

  INSERT INTO public.audit_logs (actor_id,target_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),target_user_id,CASE WHEN p_approved THEN 'vendor_verification_approved' ELSE 'vendor_verification_rejected' END,'vendors',p_vendor_id,jsonb_build_object('reason',p_reason));
END $$;

REVOKE ALL ON FUNCTION public.review_vendor_verification(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_vendor_verification(uuid, boolean, text) TO authenticated;

COMMIT;
