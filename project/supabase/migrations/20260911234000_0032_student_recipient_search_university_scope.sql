-- Phase A3.2L successor: unaffiliated students cannot enumerate one another.
BEGIN;

CREATE OR REPLACE FUNCTION public.search_message_recipients(
  p_query text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_university_id uuid;
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF char_length(v_query) < 2 THEN RAISE EXCEPTION 'Enter at least two characters' USING ERRCODE = '22023'; END IF;
  SELECT university_id INTO v_university_id
  FROM public.profiles
  WHERE id = v_caller AND role_id = 2 AND is_active AND status = 'active';
  IF NOT FOUND OR v_university_id IS NULL THEN
    RAISE EXCEPTION 'Student recipient search requires a university association' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id <> v_caller AND p.role_id = 2 AND p.is_active AND p.status = 'active'
    AND p.university_id = v_university_id
    AND p.full_name ILIKE '%' || v_query || '%'
    AND NOT EXISTS (SELECT 1 FROM public.account_restrictions r WHERE r.user_id = p.id AND r.is_active AND (r.ends_at IS NULL OR r.ends_at > now()))
    AND NOT EXISTS (SELECT 1 FROM public.blocked_users b WHERE (b.blocker_id = v_caller AND b.blocked_id = p.id) OR (b.blocker_id = p.id AND b.blocked_id = v_caller))
  ORDER BY p.full_name NULLS LAST, p.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);
END
$$;

REVOKE ALL ON FUNCTION public.search_message_recipients(text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_message_recipients(text, integer) TO authenticated;

COMMIT;
