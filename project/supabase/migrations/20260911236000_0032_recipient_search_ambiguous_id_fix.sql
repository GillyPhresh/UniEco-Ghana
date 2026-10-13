-- Fix the recipient-search function's ambiguous output-column/table-column
-- reference without changing its authorization or university-scoping behavior.
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_query) < 2 THEN
    RAISE EXCEPTION 'Enter at least two characters' USING ERRCODE = '22023';
  END IF;

  SELECT profile.university_id
  INTO v_university_id
  FROM public.profiles AS profile
  WHERE profile.id = v_caller
    AND profile.role_id = 2
    AND profile.is_active
    AND profile.status = 'active';

  IF NOT FOUND OR v_university_id IS NULL THEN
    RAISE EXCEPTION 'Student recipient search requires a university association' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT profile.id, profile.full_name, profile.avatar_url
  FROM public.profiles AS profile
  WHERE profile.id <> v_caller
    AND profile.role_id = 2
    AND profile.is_active
    AND profile.status = 'active'
    AND profile.university_id = v_university_id
    AND profile.full_name ILIKE '%' || v_query || '%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.account_restrictions AS restriction
      WHERE restriction.user_id = profile.id
        AND restriction.is_active
        AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocked_users AS block
      WHERE (block.blocker_id = v_caller AND block.blocked_id = profile.id)
         OR (block.blocker_id = profile.id AND block.blocked_id = v_caller)
    )
  ORDER BY profile.full_name NULLS LAST, profile.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);
END
$$;

REVOKE ALL ON FUNCTION public.search_message_recipients(text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_message_recipients(text, integer) TO authenticated;

COMMIT;
