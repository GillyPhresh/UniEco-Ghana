-- Private chronological feed of published posts from accounts the viewer follows.
-- Do not broaden the public feed or expose the underlying follow graph.
BEGIN;

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
    COALESCE(NULLIF(btrim(vendor.business_name), ''), NULLIF(btrim(author.full_name), ''), 'Campus member'),
    author.avatar_url, role.name, university.name, university.slug,
    post.caption, post.media_path, post.media_type, post.created_at
  FROM public.campus_community_follows AS follow
  JOIN public.campus_community_posts AS post ON post.author_id = follow.following_id
  JOIN public.profiles AS author ON author.id = post.author_id
  JOIN public.user_roles AS role ON role.id = author.role_id
  LEFT JOIN public.universities AS university ON university.id = post.university_id
  LEFT JOIN LATERAL (
    SELECT candidate.business_name FROM public.vendors AS candidate
    WHERE candidate.owner_id = author.id AND candidate.is_active
    ORDER BY candidate.created_at DESC, candidate.id LIMIT 1
  ) AS vendor ON true
  WHERE follow.follower_id = v_viewer_id
    AND post.status = 'published'
    AND public.can_use_campus_community(author.id)
    AND public.community_users_can_interact(v_viewer_id, author.id)
    AND (p_before_created_at IS NULL OR (post.created_at, post.id) < (p_before_created_at, p_before_id))
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 12);
END
$$;

REVOKE ALL ON FUNCTION public.get_campus_community_following_feed(timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campus_community_following_feed(timestamptz, uuid, integer) TO authenticated;

COMMIT;
