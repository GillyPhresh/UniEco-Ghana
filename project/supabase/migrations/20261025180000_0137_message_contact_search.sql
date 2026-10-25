-- Messaging contact search must use a participant-safe read model. The
-- vendors table is intentionally private for pending verification records,
-- so a browser query cannot reliably find an active business owner either.
BEGIN;

CREATE OR REPLACE FUNCTION public.search_message_contacts(
  p_query text,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  kind text,
  subtitle text
)
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
    AND profile.is_active
    AND profile.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Messaging is unavailable for this account' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      profile.id,
      profile.full_name,
      profile.avatar_url,
      'student'::text AS kind,
      'Student'::text AS subtitle
    FROM public.profiles AS profile
    WHERE profile.id <> v_caller
      AND profile.role_id = 2
      AND profile.is_active
      AND profile.status = 'active'
      AND v_university_id IS NOT NULL
      AND profile.university_id = v_university_id
      AND COALESCE(profile.full_name, '') ILIKE '%' || v_query || '%'
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

    UNION ALL

    SELECT
      vendor.owner_id AS id,
      vendor.business_name AS full_name,
      vendor.logo_url AS avatar_url,
      'business'::text AS kind,
      'Business'::text AS subtitle
    FROM public.vendors AS vendor
    JOIN public.profiles AS owner ON owner.id = vendor.owner_id
    WHERE vendor.owner_id <> v_caller
      AND vendor.is_active
      AND owner.is_active
      AND owner.status = 'active'
      AND COALESCE(vendor.business_name, '') ILIKE '%' || v_query || '%'
      AND NOT EXISTS (
        SELECT 1
        FROM public.account_restrictions AS restriction
        WHERE restriction.user_id = vendor.owner_id
          AND restriction.is_active
          AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocked_users AS block
        WHERE (block.blocker_id = v_caller AND block.blocked_id = vendor.owner_id)
           OR (block.blocker_id = vendor.owner_id AND block.blocked_id = v_caller)
      )
  ),
  deduplicated AS (
    SELECT DISTINCT ON (candidate.id)
      candidate.id,
      candidate.full_name,
      candidate.avatar_url,
      candidate.kind,
      candidate.subtitle
    FROM candidates AS candidate
    ORDER BY candidate.id, CASE WHEN candidate.kind = 'business' THEN 0 ELSE 1 END
  )
  SELECT
    result.id,
    result.full_name,
    result.avatar_url,
    result.kind,
    result.subtitle
  FROM deduplicated AS result
  ORDER BY CASE WHEN result.kind = 'business' THEN 0 ELSE 1 END,
           lower(COALESCE(result.full_name, '')),
           result.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 20);
END
$$;

REVOKE ALL ON FUNCTION public.search_message_contacts(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_message_contacts(text, integer)
  TO authenticated;

COMMIT;
