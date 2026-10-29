-- UniEco Ghana university administrator programme.
--
-- A university may have multiple administrators. Each administrator receives
-- a bearer token that is shown only once. Registrations are attributed to the
-- assignment, not to a mutable profile field, and monthly compensation is
-- calculated from qualified registrations only.
--
-- Payouts are deliberately a two-step process: calculate/approve first, then
-- mark paid after a verified transfer. No money is sent by this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.university_admin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','revoked')),
  job_title text NOT NULL DEFAULT 'University Administrator',
  appointed_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  appointed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'active' AND ended_at IS NULL) OR status <> 'active')
);
CREATE UNIQUE INDEX IF NOT EXISTS university_admin_one_active_assignment_idx
  ON public.university_admin_assignments(university_id, user_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS university_admin_assignments_user_idx
  ON public.university_admin_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS university_admin_assignments_university_idx
  ON public.university_admin_assignments(university_id, status);
ALTER TABLE public.university_admin_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_assignments FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.university_admin_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.university_admin_assignments(id) ON DELETE RESTRICT,
  token_digest text NOT NULL UNIQUE,
  token_hint text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (expires_at IS NULL OR expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX IF NOT EXISTS university_admin_tokens_assignment_idx
  ON public.university_admin_tokens(assignment_id, issued_at DESC);
ALTER TABLE public.university_admin_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_tokens FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.university_admin_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.university_admin_assignments(id) ON DELETE RESTRICT,
  token_id uuid NOT NULL REFERENCES public.university_admin_tokens(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
  registration_type text NOT NULL CHECK (registration_type IN ('student','vendor','student_vendor')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','qualified','reversed','rejected')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  reversed_at timestamptz,
  qualification_source text,
  CHECK ((status = 'qualified' AND qualified_at IS NOT NULL) OR status <> 'qualified'),
  CHECK ((status = 'reversed' AND reversed_at IS NOT NULL) OR status <> 'reversed')
);
CREATE INDEX IF NOT EXISTS university_admin_referrals_assignment_idx
  ON public.university_admin_referrals(assignment_id, status, captured_at DESC);
CREATE INDEX IF NOT EXISTS university_admin_referrals_month_idx
  ON public.university_admin_referrals(university_id, qualified_at DESC)
  WHERE status = 'qualified';
ALTER TABLE public.university_admin_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_referrals FROM PUBLIC, anon, authenticated, service_role;

-- Keep the compensation rate configurable. The default is zero until the
-- super administrator sets the approved rate for the programme.
CREATE TABLE IF NOT EXISTS public.university_admin_compensation_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  rate_per_qualified_registration numeric(12,2) NOT NULL DEFAULT 0.00
    CHECK (rate_per_qualified_registration >= 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.university_admin_compensation_settings(singleton)
VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.university_admin_compensation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_compensation_settings FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.university_admin_monthly_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.university_admin_assignments(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE RESTRICT,
  month_start date NOT NULL,
  month_end date NOT NULL,
  student_count integer NOT NULL DEFAULT 0 CHECK (student_count >= 0),
  vendor_count integer NOT NULL DEFAULT 0 CHECK (vendor_count >= 0),
  qualified_count integer NOT NULL DEFAULT 0 CHECK (qualified_count >= 0),
  rate_per_registration numeric(12,2) NOT NULL CHECK (rate_per_registration >= 0),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','paid','void')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payout_reference text,
  UNIQUE (assignment_id, month_start),
  CHECK (month_start = date_trunc('month', month_start)::date),
  CHECK (month_end = (month_start + interval '1 month')::date)
);
CREATE INDEX IF NOT EXISTS university_admin_monthly_earnings_university_idx
  ON public.university_admin_monthly_earnings(university_id, month_start DESC);
ALTER TABLE public.university_admin_monthly_earnings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_admin_monthly_earnings FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_university_admin_assignment(
  p_university_id uuid,
  p_user_id uuid,
  p_job_title text DEFAULT 'University Administrator'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  assignment public.university_admin_assignments%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.universities WHERE id = p_university_id AND is_enabled) THEN
    RAISE EXCEPTION 'University is not available for administrator assignment' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_active AND status = 'active') THEN
    RAISE EXCEPTION 'Administrator account must be active' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assign_university_administrator(
    p_user_id,
    p_university_id,
    'Approved through the University Administrator programme'
  );
  INSERT INTO public.university_admin_assignments(university_id,user_id,job_title,appointed_by)
  VALUES (p_university_id,p_user_id,COALESCE(NULLIF(trim(p_job_title),''),'University Administrator'),actor)
  RETURNING * INTO assignment;
  RETURN jsonb_build_object(
    'assignment_id', assignment.id,
    'university_id', assignment.university_id,
    'user_id', assignment.user_id,
    'status', assignment.status,
    'job_title', assignment.job_title
  );
END $func$;

CREATE OR REPLACE FUNCTION public.issue_university_admin_token(
  p_assignment_id uuid,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  assignment public.university_admin_assignments%ROWTYPE;
  token_value text := 'UEA-' || upper(encode(extensions.gen_random_bytes(12), 'hex'));
  token_row public.university_admin_tokens%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO assignment FROM public.university_admin_assignments
  WHERE id = p_assignment_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active university administrator assignment not found' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'Token expiry must be in the future' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.university_admin_tokens(
    assignment_id, token_digest, token_hint, expires_at, issued_by
  ) VALUES (
    assignment.id,
    encode(extensions.digest(token_value, 'sha256'), 'hex'),
    left(token_value, 12),
    p_expires_at,
    actor
  ) RETURNING * INTO token_row;
  RETURN jsonb_build_object(
    'token', token_value,
    'token_id', token_row.id,
    'token_hint', token_row.token_hint,
    'expires_at', token_row.expires_at,
    'registration_path', '/signup?university_admin_token=' || token_value
  );
END $func$;

CREATE OR REPLACE FUNCTION public.revoke_university_admin_token(p_token_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.university_admin_tokens
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE id = p_token_id AND revoked_at IS NULL;
END $func$;

CREATE OR REPLACE FUNCTION public.claim_university_admin_registration(
  p_token text,
  p_referred_user_id uuid,
  p_registration_type text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  token_row record;
  referral public.university_admin_referrals%ROWTYPE;
BEGIN
  IF actor IS NULL OR actor <> p_referred_user_id THEN
    RAISE EXCEPTION 'The signed-in user must claim their own registration' USING ERRCODE = '42501';
  END IF;
  IF p_registration_type NOT IN ('student','vendor','student_vendor') THEN
    RAISE EXCEPTION 'Unsupported registration type' USING ERRCODE = '22023';
  END IF;
  SELECT token.id, token.assignment_id, assignment.university_id
  INTO token_row
  FROM public.university_admin_tokens token
  JOIN public.university_admin_assignments assignment ON assignment.id = token.assignment_id
  WHERE token.token_digest = encode(extensions.digest(upper(trim(p_token)), 'sha256'), 'hex')
    AND token.revoked_at IS NULL
    AND (token.expires_at IS NULL OR token.expires_at > now())
    AND assignment.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'University administrator link is invalid or expired' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_referred_user_id) THEN
    RAISE EXCEPTION 'Registration account not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.university_admin_referrals(
    assignment_id, token_id, university_id, referred_user_id, registration_type
  ) VALUES (
    token_row.assignment_id, token_row.id, token_row.university_id,
    p_referred_user_id, p_registration_type
  )
  ON CONFLICT (referred_user_id) DO NOTHING
  RETURNING * INTO referral;
  IF NOT FOUND THEN
    SELECT * INTO referral FROM public.university_admin_referrals
    WHERE referred_user_id = p_referred_user_id;
  END IF;
  RETURN jsonb_build_object(
    'referral_id', referral.id,
    'university_id', referral.university_id,
    'assignment_id', referral.assignment_id,
    'status', referral.status,
    'already_claimed', referral.assignment_id <> token_row.assignment_id
  );
END $func$;

-- Internal qualification path. Student referrals qualify after a successful
-- registration payment; vendor referrals qualify only for an active vendor
-- role. It is never exposed to the client directly.
CREATE OR REPLACE FUNCTION public.qualify_university_admin_registration_internal(
  p_referred_user_id uuid,
  p_source text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
BEGIN
  UPDATE public.university_admin_referrals referral
  SET status = 'qualified', qualified_at = COALESCE(qualified_at, now()), qualification_source = p_source
  FROM public.profiles profile
  JOIN public.user_roles role ON role.id = profile.role_id
  WHERE referral.referred_user_id = p_referred_user_id
    AND referral.status = 'pending'
    AND profile.id = referral.referred_user_id
    AND profile.is_active
    AND profile.status = 'active'
    AND (
      (
        referral.registration_type IN ('student','student_vendor')
        AND role.name IN ('student','student_vendor')
        AND EXISTS (
          SELECT 1 FROM public.student_registration_payments payment
          WHERE payment.user_id = referral.referred_user_id AND payment.status = 'paid'
        )
      )
      OR (
        referral.registration_type IN ('vendor','student_vendor')
        AND role.name IN ('vendor','external_vendor','student_vendor')
      )
    );
END $func$;

CREATE OR REPLACE FUNCTION public.qualify_university_admin_registration(
  p_referred_user_id uuid,
  p_source text DEFAULT 'verified_registration'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
BEGIN
  IF auth.uid() IS NULL OR (auth.role() <> 'service_role' AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Privileged qualification worker required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.qualify_university_admin_registration_internal(p_referred_user_id, p_source);
END $func$;

CREATE OR REPLACE FUNCTION public.qualify_university_admin_student_payment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.qualify_university_admin_registration_internal(NEW.user_id, 'student_registration_payment');
  END IF;
  RETURN NEW;
END $func$;
DROP TRIGGER IF EXISTS qualify_university_admin_student_payment ON public.student_registration_payments;
CREATE TRIGGER qualify_university_admin_student_payment
AFTER INSERT OR UPDATE OF status ON public.student_registration_payments
FOR EACH ROW WHEN (NEW.status = 'paid')
EXECUTE FUNCTION public.qualify_university_admin_student_payment();

CREATE OR REPLACE FUNCTION public.get_my_university_admin_dashboard(
  p_university_id uuid DEFAULT NULL,
  p_month_start date DEFAULT date_trunc('month', now())::date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  selected_university uuid := p_university_id;
  assignment_ids uuid[];
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin() THEN
    IF selected_university IS NULL THEN
      SELECT university_id INTO selected_university
      FROM public.university_admin_assignments WHERE status = 'active' LIMIT 1;
    END IF;
  ELSE
    SELECT array_agg(id), COALESCE(selected_university, min(university_id))
    INTO assignment_ids, selected_university
    FROM public.university_admin_assignments
    WHERE user_id = actor AND status = 'active'
      AND (p_university_id IS NULL OR university_id = p_university_id);
    IF assignment_ids IS NULL THEN
      RAISE EXCEPTION 'University administrator access required' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF selected_university IS NULL THEN
    RETURN jsonb_build_object('university_id',NULL,'assignments',0,'current_month',NULL,'monthly_history','[]'::jsonb);
  END IF;
  SELECT jsonb_build_object(
    'university_id', selected_university,
    'assignments', (SELECT count(*) FROM public.university_admin_assignments a WHERE a.university_id=selected_university AND a.status='active'),
    'current_month', jsonb_build_object(
      'month_start', p_month_start,
      'student_count', COALESCE((SELECT sum(e.student_count) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0),
      'vendor_count', COALESCE((SELECT sum(e.vendor_count) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0),
      'qualified_count', COALESCE((SELECT sum(e.qualified_count) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0),
      'amount', COALESCE((SELECT sum(e.amount) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND e.month_start=p_month_start),0)
    ),
    'monthly_history', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.month_start DESC) FROM public.university_admin_monthly_earnings e WHERE e.university_id=selected_university AND (public.is_super_admin() OR e.assignment_id=ANY(assignment_ids))),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $func$;

CREATE OR REPLACE FUNCTION public.finalize_university_admin_month(p_month_start date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  actor uuid := auth.uid();
  rate numeric(12,2);
  rows_written integer;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_month_start <> date_trunc('month', p_month_start)::date OR p_month_start >= date_trunc('month', now())::date THEN
    RAISE EXCEPTION 'Only completed calendar months can be finalized' USING ERRCODE = '22023';
  END IF;
  SELECT rate_per_qualified_registration INTO rate
  FROM public.university_admin_compensation_settings WHERE singleton FOR UPDATE;
  INSERT INTO public.university_admin_monthly_earnings(
    assignment_id, university_id, month_start, month_end,
    student_count, vendor_count, qualified_count, rate_per_registration, amount
  )
  SELECT
    assignment.id,
    assignment.university_id,
    p_month_start,
    (p_month_start + interval '1 month')::date,
    count(*) FILTER (WHERE referral.registration_type IN ('student','student_vendor'))::integer,
    count(*) FILTER (WHERE referral.registration_type IN ('vendor','student_vendor'))::integer,
    count(*)::integer,
    rate,
    count(*) * rate
  FROM public.university_admin_assignments assignment
  LEFT JOIN public.university_admin_referrals referral
    ON referral.assignment_id = assignment.id
   AND referral.status = 'qualified'
   AND referral.qualified_at >= p_month_start
   AND referral.qualified_at < (p_month_start + interval '1 month')
  WHERE assignment.status IN ('active','suspended','revoked')
  GROUP BY assignment.id, assignment.university_id
  ON CONFLICT (assignment_id, month_start) DO UPDATE
    SET student_count=excluded.student_count,
        vendor_count=excluded.vendor_count,
        qualified_count=excluded.qualified_count,
        rate_per_registration=excluded.rate_per_registration,
        amount=excluded.amount,
        calculated_at=now()
    WHERE public.university_admin_monthly_earnings.status = 'draft';
  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END $func$;

CREATE OR REPLACE FUNCTION public.approve_university_admin_month(p_month_start date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); changed integer;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.university_admin_monthly_earnings
  SET status='approved', approved_at=COALESCE(approved_at,now()), approved_by=actor
  WHERE month_start=p_month_start AND status='draft';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $func$;

CREATE OR REPLACE FUNCTION public.mark_university_admin_month_paid(
  p_month_start date,
  p_payout_reference text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE actor uuid := auth.uid(); changed integer;
BEGIN
  IF actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF length(trim(p_payout_reference)) < 4 THEN
    RAISE EXCEPTION 'Verified payout reference is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.university_admin_monthly_earnings
  SET status='paid', paid_at=COALESCE(paid_at,now()), paid_by=actor, payout_reference=trim(p_payout_reference)
  WHERE month_start=p_month_start AND status='approved';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $func$;

GRANT EXECUTE ON FUNCTION public.create_university_admin_assignment(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_university_admin_token(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_university_admin_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_university_admin_registration(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_university_admin_registration(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_university_admin_dashboard(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_university_admin_month(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_university_admin_month(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_university_admin_month_paid(date,text) TO authenticated;

COMMIT;


