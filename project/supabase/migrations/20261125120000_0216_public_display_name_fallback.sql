-- Public callers receive one display name, never a pair of names.
BEGIN;

-- No existing profile has consented to the registered-name fallback.
-- Enable the default for future rows only after the signup notice is live.
ALTER TABLE public.profiles ADD COLUMN show_registered_name boolean NOT NULL DEFAULT false;
GRANT UPDATE (show_registered_name) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.public_profile_display_name(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT coalesce(nullif(btrim(p.public_nickname), ''),
    CASE WHEN NOT p.show_registered_name THEN 'UniEco user'
         WHEN p.full_name !~ '@|^[+()[:digit:][:space:].-]+$'
         THEN nullif(regexp_replace(p.full_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '') END)
    FROM public.profiles p WHERE p.id = p_user_id), 'Unnamed user')
$$;
REVOKE ALL ON FUNCTION public.public_profile_display_name(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- A computed review field also works when the reviewer's private profiles row
-- isn't readable. Re-read by review ID; never trust the fields in a caller-supplied row.
CREATE OR REPLACE FUNCTION public.review_public_identity(public.reviews)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('display_name', public.public_profile_display_name(p.id), 'avatar_url', p.avatar_url)
  FROM public.reviews r JOIN public.profiles p ON p.id = r.reviewer_id
  WHERE r.id = ($1).id AND p.is_active AND p.status = 'active'
    AND (r.is_approved OR r.reviewer_id = auth.uid() OR public.is_super_admin()
         OR public.has_permission('can_moderate_content'))
$$;
REVOKE ALL ON FUNCTION public.review_public_identity(public.reviews) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_public_identity(public.reviews) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_campus_community_following_feed(
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_role text,
  university_name text, university_slug text, caption text, media_path text,
  media_type text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
BEGIN
  IF NOT public.can_use_campus_community(v_viewer_id) THEN
    RAISE EXCEPTION 'Sign in with an active UniEco account to view this feed' USING ERRCODE = '42501';
  END IF;
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid feed cursor' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT post.id, author.id,
    public.public_profile_display_name(author.id),
    author.avatar_url, role.name, university.name, university.slug,
    post.caption, post.media_path, post.media_type, post.created_at
  FROM public.campus_community_follows AS follow
  JOIN public.campus_community_posts AS post ON post.author_id = follow.following_id
  JOIN public.profiles AS author ON author.id = post.author_id
  JOIN public.user_roles AS role ON role.id = author.role_id
  LEFT JOIN public.universities AS university ON university.id = post.university_id
  WHERE follow.follower_id = v_viewer_id
    AND post.status = 'published'
    AND public.can_use_campus_community(author.id)
    AND public.community_users_can_interact(v_viewer_id, author.id)
    AND (p_before_created_at IS NULL OR (post.created_at, post.id) < (p_before_created_at, p_before_id))
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 12);
END
$$;

CREATE OR REPLACE FUNCTION public.search_message_contacts(p_query text,p_limit integer DEFAULT 12)
RETURNS TABLE (id uuid,full_name text,avatar_url text,kind text,subtitle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_caller uuid:=auth.uid(); v_query text:=btrim(COALESCE(p_query,''));
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF char_length(v_query)<2 THEN RAISE EXCEPTION 'Enter at least two characters' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_caller AND p.is_active AND p.status='active') THEN
    RAISE EXCEPTION 'Messaging is unavailable for this account' USING ERRCODE='42501';
  END IF;
  RETURN QUERY WITH candidates AS (
    SELECT p.id,public.public_profile_display_name(p.id) AS display_name,p.avatar_url,'student'::text AS contact_kind,'Student'::text AS contact_subtitle
    FROM public.profiles p WHERE p.id<>v_caller AND p.role_id=2 AND p.is_active AND p.status='active'
      AND public.public_profile_display_name(p.id) ILIKE '%'||v_query||'%'
      AND NOT EXISTS(SELECT 1 FROM public.account_restrictions r WHERE r.user_id=p.id AND r.is_active AND (r.ends_at IS NULL OR r.ends_at>now()))
      AND NOT EXISTS(SELECT 1 FROM public.blocked_users b WHERE (b.blocker_id=v_caller AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v_caller))
    UNION ALL
    SELECT v.owner_id,v.business_name,v.logo_url,'business'::text,'Business'::text
    FROM public.vendors v JOIN public.profiles owner ON owner.id=v.owner_id
    WHERE v.owner_id<>v_caller AND v.is_active AND owner.is_active AND owner.status='active'
      AND (COALESCE(v.business_name,'') ILIKE '%'||v_query||'%' OR COALESCE(owner.public_nickname,'') ILIKE '%'||v_query||'%')
      AND NOT EXISTS(SELECT 1 FROM public.account_restrictions r WHERE r.user_id=v.owner_id AND r.is_active AND (r.ends_at IS NULL OR r.ends_at>now()))
      AND NOT EXISTS(SELECT 1 FROM public.blocked_users b WHERE (b.blocker_id=v_caller AND b.blocked_id=v.owner_id) OR (b.blocker_id=v.owner_id AND b.blocked_id=v_caller))
  ), deduplicated AS (
    SELECT DISTINCT ON(c.id) c.* FROM candidates c ORDER BY c.id,CASE WHEN c.contact_kind='business' THEN 0 ELSE 1 END
  )
  SELECT d.id,d.display_name,d.avatar_url,d.contact_kind,d.contact_subtitle FROM deduplicated d
  ORDER BY CASE WHEN d.contact_kind='business' THEN 0 ELSE 1 END,lower(COALESCE(d.display_name,'')),d.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit,12),1),20);
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
