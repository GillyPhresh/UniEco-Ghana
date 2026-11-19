-- Registration assistance only. No provider calls, payments, entitlement changes or drafts from keystrokes.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.registration_contact_steps (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lane text NOT NULL CHECK (lane IN ('student','external_vendor')),
  phone text NOT NULL CHECK (phone ~ '^0[0-9]{9}$'),
  business_email text CHECK (length(business_email) <= 160),
  submitted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.registration_contact_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_contact_steps FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_my_registration_contact_step(p_lane text, p_phone text, p_business_email text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  uid uuid := auth.uid();
  access_state jsonb := public.registration_account_state(uid);
  address text := nullif(btrim(p_business_email), '');
BEGIN
  IF uid IS NULL OR (CASE p_lane
    WHEN 'student' THEN access_state->>'can_pay_student_registration'
    WHEN 'external_vendor' THEN access_state->>'can_pay_vendor_registration'
    ELSE NULL END) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Registration step unavailable' USING ERRCODE='42501';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^0[0-9]{9}$' OR
    (address IS NOT NULL AND (p_lane <> 'external_vendor' OR length(address)>160 OR
      address !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+[.][^@[:space:][:cntrl:]]+$')) THEN
    RAISE EXCEPTION 'Invalid registration contact' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.registration_contact_steps(user_id,lane,phone,business_email)
    VALUES (uid,p_lane,p_phone,address)
    ON CONFLICT(user_id) DO UPDATE SET lane=excluded.lane, phone=excluded.phone,
      business_email=excluded.business_email, submitted_at=now();
END;
$$;

-- Fail closed on the previous client as well (NULL role is not authorization).
ALTER FUNCTION public.get_admin_registration_followups(integer) RENAME TO registration_followups_legacy_private;
REVOKE ALL ON FUNCTION public.registration_followups_legacy_private(integer) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.get_admin_registration_followups(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,user_id uuid,alert_type text,created_at timestamptz,resolved_at timestamptz,
 full_name text,email text,phone text,role_name text,university_name text,business_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN
 IF public.current_app_role() IS DISTINCT FROM 'super_admin' OR NOT EXISTS
   (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND p.status='active') THEN
   RAISE EXCEPTION 'Super Admin access required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT * FROM public.registration_followups_legacy_private(p_limit);
END;
$$;

CREATE FUNCTION public.registration_contact_page(p_view text, p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL, p_limit integer DEFAULT 26)
RETURNS TABLE(id uuid,created_at timestamptz,kind text,full_name text,email text,email_confirmed boolean,
 phone text,business_name text,business_phone text,business_email text,university_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN
 IF public.current_app_role() IS DISTINCT FROM 'super_admin' OR NOT EXISTS
   (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND p.status='active') THEN
   RAISE EXCEPTION 'Super Admin access required' USING ERRCODE='42501';
 END IF;
 IF p_view IS NULL OR p_view NOT IN ('pending','completed') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51
    OR (p_before IS NULL) <> (p_before_id IS NULL) THEN
   RAISE EXCEPTION 'Invalid follow-up page' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 WITH candidates AS NOT MATERIALIZED (
   SELECT p.id, p.created_at, p.id AS owner, s.state
   FROM public.profiles p JOIN public.user_roles r ON r.id=p.role_id
   CROSS JOIN LATERAL (SELECT public.registration_account_state(p.id) AS state OFFSET 0) s
   WHERE p_view='pending' AND r.name IN ('student','student_vendor','external_vendor')
     AND p.is_active AND p.status IN ('active','pending','pending_payment','pending_approval')
     AND p.created_at <= now()-interval '30 minutes'
     AND (p_before IS NULL OR (p.created_at,p.id)<(p_before,p_before_id))
     AND NOT public.courier_without_paid_intent(p.id)
     AND NOT EXISTS (SELECT 1 FROM public.account_restrictions ar WHERE ar.user_id=p.id
       AND ar.is_active AND (ar.ends_at IS NULL OR ar.ends_at>now()))
 ), page AS (
   SELECT q.* FROM (
     SELECT c.id,c.created_at,c.owner,coalesce(c.state->>'registration_intent','undecided') AS kind
     FROM candidates c WHERE c.state->>'allowed'='false'
       AND NOT EXISTS (SELECT 1 FROM public.vendor_registration_payment_states s WHERE s.owner_id=c.owner
         AND s.payment_requirement='not_required' AND s.state='awaiting_verification')
     UNION ALL
     SELECT a.id,a.created_at,a.user_id,a.alert_type FROM public.admin_registration_alerts a
     WHERE p_view='completed' AND a.alert_type IN ('student_completed','vendor_completed')
       AND (p_before IS NULL OR (a.created_at,a.id)<(p_before,p_before_id))
   ) q ORDER BY q.created_at DESC,q.id DESC LIMIT p_limit
 )
 SELECT x.id,x.created_at,x.kind,p.full_name,coalesce(nullif(btrim(u.email),''),nullif(btrim(p.email),'')),
   u.email_confirmed_at IS NOT NULL AND nullif(btrim(u.email),'') IS NOT NULL,
   coalesce(CASE WHEN step.lane='student' THEN step.phone END,nullif(btrim(p.phone),'')),
   v.business_name,coalesce(CASE WHEN step.lane='external_vendor' THEN step.phone END,nullif(btrim(v.contact_phone),'')),
   coalesce(CASE WHEN step.lane='external_vendor' THEN step.business_email END,nullif(btrim(v.contact_email),'')),uni.name
 FROM page x JOIN public.profiles p ON p.id=x.owner JOIN auth.users u ON u.id=p.id
 LEFT JOIN public.universities uni ON uni.id=p.university_id
 LEFT JOIN public.registration_contact_steps step ON step.user_id=p.id AND p_view='pending'
   AND step.lane=x.kind AND step.submitted_at>now()-interval '90 days'
 LEFT JOIN LATERAL (SELECT b.business_name,b.contact_phone,b.contact_email FROM public.vendors b
   WHERE b.owner_id=p.id AND x.kind IN ('external_vendor','vendor_completed')
   ORDER BY b.created_at DESC,b.id DESC LIMIT 1) v ON true
 ORDER BY x.created_at DESC,x.id DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.save_my_registration_contact_step(text,text,text),
 public.get_admin_registration_followups(integer),public.registration_contact_page(text,timestamptz,uuid,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_my_registration_contact_step(text,text,text),
 public.get_admin_registration_followups(integer),public.registration_contact_page(text,timestamptz,uuid,integer) TO authenticated;
DO $$ BEGIN
 IF to_regnamespace('cron') IS NOT NULL THEN
   PERFORM cron.schedule('unieco-expire-registration-contact-steps','41 2 * * *',
     'DELETE FROM public.registration_contact_steps WHERE submitted_at <= now() - interval ''90 days''');
 END IF;
END $$;
COMMIT;
