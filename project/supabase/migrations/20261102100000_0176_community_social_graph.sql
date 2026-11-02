-- UniEco Ghana community interactions: private writes, narrow public RPCs.
-- Public profiles expose only display identity and campus-safe fields. No auth
-- email, phone, student number, or verification documents are returned.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campus_community_post_likes (
  post_id uuid NOT NULL REFERENCES public.campus_community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campus_community_post_bookmarks (
  post_id uuid NOT NULL REFERENCES public.campus_community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campus_community_follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.campus_community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.campus_community_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.campus_community_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS campus_community_likes_post_idx
  ON public.campus_community_post_likes (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campus_community_bookmarks_user_idx
  ON public.campus_community_post_bookmarks (user_id, created_at DESC, post_id);
CREATE INDEX IF NOT EXISTS campus_community_follows_target_idx
  ON public.campus_community_follows (following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campus_community_comments_post_idx
  ON public.campus_community_comments (post_id, created_at DESC, id DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS campus_community_comments_author_idx
  ON public.campus_community_comments (author_id, created_at DESC);

-- Keep reading public while reserving publishing for verified students and
-- businesses. Role/profile values are read from database-owned records only.
CREATE OR REPLACE FUNCTION public.can_publish_campus_community(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.id = profile.role_id
    WHERE profile.id = p_user_id
      AND profile.is_active AND profile.status = 'active'
      AND role.name IN ('student', 'student_vendor', 'external_vendor')
      AND NOT EXISTS (
        SELECT 1 FROM public.account_restrictions AS restriction
        WHERE restriction.user_id = profile.id AND restriction.is_active
          AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
      )
      AND (
        (role.name = 'student' AND EXISTS (
          SELECT 1 FROM public.student_profiles AS student
          WHERE student.user_id = profile.id AND student.is_verified_student
            AND student.verification_status = 'verified'
        ))
        OR (role.name = 'student_vendor' AND (
          EXISTS (
            SELECT 1 FROM public.student_profiles AS student
            WHERE student.user_id = profile.id AND student.is_verified_student
              AND student.verification_status = 'verified'
          )
          OR EXISTS (
            SELECT 1 FROM public.vendor_profiles AS vendor_profile
            JOIN public.vendors AS vendor ON vendor.owner_id = vendor_profile.profile_id
            WHERE vendor_profile.profile_id = profile.id
              AND vendor_profile.verification_status IN ('active', 'verified')
              AND vendor.is_verified AND vendor.is_active
          )
        ))
        OR (role.name = 'external_vendor' AND EXISTS (
          SELECT 1 FROM public.vendor_profiles AS vendor_profile
          JOIN public.vendors AS vendor ON vendor.owner_id = vendor_profile.profile_id
          WHERE vendor_profile.profile_id = profile.id
            AND vendor_profile.verification_status IN ('active', 'verified')
            AND vendor.is_verified AND vendor.is_active
        ))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_upload_campus_community_media()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.can_publish_campus_community(auth.uid())
$$;

-- The original RPC accepted any active account. Replace it in place so an
-- unverified account cannot bypass the client UI and publish through PostgREST.
CREATE OR REPLACE FUNCTION public.create_campus_community_post(
  p_caption text,
  p_media_path text,
  p_media_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_university_id uuid;
  v_caption text := btrim(COALESCE(p_caption, ''));
  v_extension text;
  v_post_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to share a campus post' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_publish_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Complete UniEco verification before publishing campus posts' USING ERRCODE = '42501';
  END IF;
  SELECT profile.university_id INTO v_university_id
  FROM public.profiles AS profile WHERE profile.id = v_user_id;
  IF char_length(v_caption) > 500 OR (v_caption = '' AND p_media_path IS NULL) THEN
    RAISE EXCEPTION 'A post needs media and a caption of no more than 500 characters' USING ERRCODE = '22023';
  END IF;
  IF p_media_path IS NULL OR char_length(p_media_path) > 240
     OR p_media_path !~ ('^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|webm)$')
     OR p_media_type IS NULL OR p_media_type NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'Invalid community media' USING ERRCODE = '22023';
  END IF;
  v_extension := lower(substring(p_media_path FROM '\.([a-z0-9]+)$'));
  IF (p_media_type = 'image' AND v_extension NOT IN ('jpg', 'jpeg', 'png', 'webp'))
     OR (p_media_type = 'video' AND v_extension NOT IN ('mp4', 'webm')) THEN
    RAISE EXCEPTION 'Media type does not match the uploaded file' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects AS object
    WHERE object.bucket_id = 'campus-community'
      AND object.name = p_media_path
      AND (storage.foldername(object.name))[1] = v_user_id::text
  ) THEN
    RAISE EXCEPTION 'Upload the media from this account before posting' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  IF (SELECT count(*) FROM public.campus_community_posts AS post
      WHERE post.author_id = v_user_id AND post.created_at > now() - interval '1 hour') >= 12 THEN
    RAISE EXCEPTION 'You have reached the hourly posting limit. Try again later.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.campus_community_posts (author_id, university_id, caption, media_path, media_type)
  VALUES (v_user_id, v_university_id, v_caption, p_media_path, p_media_type)
  RETURNING id INTO v_post_id;
  RETURN v_post_id;
END
$$;

ALTER TABLE public.campus_community_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_community_post_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_community_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_community_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_community_post_likes,
  public.campus_community_post_bookmarks,
  public.campus_community_follows,
  public.campus_community_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.campus_community_post_likes TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.campus_community_post_bookmarks TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.campus_community_follows TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.campus_community_comments TO service_role;

CREATE OR REPLACE FUNCTION public.can_use_campus_community(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.id = profile.role_id
    WHERE profile.id = p_user_id
      AND profile.is_active AND profile.status = 'active'
      AND role.name IN ('student', 'student_vendor', 'external_vendor')
      AND NOT EXISTS (
        SELECT 1 FROM public.account_restrictions AS restriction
        WHERE restriction.user_id = profile.id AND restriction.is_active
          AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.community_users_can_interact(p_user_id uuid, p_other_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id IS NOT NULL AND p_other_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.blocked_users AS block
    WHERE (block.blocker_id = p_user_id AND block.blocked_id = p_other_id)
       OR (block.blocker_id = p_other_id AND block.blocked_id = p_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_post_social_state(p_post_ids uuid[])
RETURNS TABLE (
  post_id uuid,
  like_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  bookmarked_by_me boolean,
  following_author boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH requested AS (
    SELECT DISTINCT unnest(COALESCE(p_post_ids, ARRAY[]::uuid[])) AS id
    LIMIT 12
  )
  SELECT post.id,
         (SELECT count(*) FROM public.campus_community_post_likes AS likes
          WHERE likes.post_id = post.id
            AND public.can_use_campus_community(likes.user_id)
            AND (auth.uid() IS NULL OR public.community_users_can_interact(auth.uid(), likes.user_id))),
         (SELECT count(*) FROM public.campus_community_comments AS comments
          WHERE comments.post_id = post.id AND comments.status = 'published'
            AND public.can_use_campus_community(comments.author_id)
            AND (auth.uid() IS NULL OR public.community_users_can_interact(auth.uid(), comments.author_id))),
         COALESCE(EXISTS (
           SELECT 1 FROM public.campus_community_post_likes AS likes
           WHERE likes.post_id = post.id AND likes.user_id = auth.uid()
         ), false),
         COALESCE(EXISTS (
           SELECT 1 FROM public.campus_community_post_bookmarks AS saved
           WHERE saved.post_id = post.id AND saved.user_id = auth.uid()
         ), false),
         COALESCE(EXISTS (
           SELECT 1 FROM public.campus_community_follows AS follows
           WHERE follows.follower_id = auth.uid() AND follows.following_id = post.author_id
         ), false)
  FROM requested
  JOIN public.campus_community_posts AS post ON post.id = requested.id
  JOIN public.profiles AS author ON author.id = post.author_id
  WHERE post.status = 'published' AND author.is_active AND author.status = 'active'
    AND (auth.uid() IS NULL OR public.community_users_can_interact(auth.uid(), post.author_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.account_restrictions AS restriction
      WHERE restriction.user_id = author.id AND restriction.is_active
        AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
    )
$$;

CREATE OR REPLACE FUNCTION public.set_campus_community_post_like(p_post_id uuid, p_liked boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_author_id uuid;
BEGIN
  IF NOT public.can_use_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Sign in with an active UniEco student or vendor account to like posts' USING ERRCODE = '42501';
  END IF;
  SELECT post.author_id INTO v_author_id
  FROM public.campus_community_posts AS post
  JOIN public.profiles AS author ON author.id = post.author_id AND author.is_active AND author.status = 'active'
  WHERE post.id = p_post_id AND post.status = 'published';
  IF NOT FOUND OR NOT public.community_users_can_interact(v_user_id, v_author_id) THEN
    RAISE EXCEPTION 'This post is unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_liked THEN
    INSERT INTO public.campus_community_post_likes (post_id, user_id)
    VALUES (p_post_id, v_user_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.campus_community_post_likes
    WHERE post_id = p_post_id AND user_id = v_user_id;
  END IF;
  RETURN p_liked;
END
$$;

CREATE OR REPLACE FUNCTION public.set_campus_community_post_bookmark(p_post_id uuid, p_saved boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_author_id uuid;
BEGIN
  IF NOT public.can_use_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Sign in with an active UniEco student or vendor account to save posts' USING ERRCODE = '42501';
  END IF;
  SELECT post.author_id INTO v_author_id
  FROM public.campus_community_posts AS post
  JOIN public.profiles AS author ON author.id = post.author_id AND author.is_active AND author.status = 'active'
  WHERE post.id = p_post_id AND post.status = 'published';
  IF NOT FOUND OR NOT public.community_users_can_interact(v_user_id, v_author_id) THEN
    RAISE EXCEPTION 'This post is unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_saved THEN
    INSERT INTO public.campus_community_post_bookmarks (post_id, user_id)
    VALUES (p_post_id, v_user_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.campus_community_post_bookmarks
    WHERE post_id = p_post_id AND user_id = v_user_id;
  END IF;
  RETURN p_saved;
END
$$;

CREATE OR REPLACE FUNCTION public.set_campus_community_follow(p_following_id uuid, p_following boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF NOT public.can_use_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Sign in with an active UniEco student or vendor account to follow members' USING ERRCODE = '42501';
  END IF;
  IF p_following_id IS NULL OR p_following_id = v_user_id
     OR NOT public.can_use_campus_community(p_following_id)
     OR NOT public.community_users_can_interact(v_user_id, p_following_id) THEN
    RAISE EXCEPTION 'This member cannot be followed' USING ERRCODE = '22023';
  END IF;
  IF p_following THEN
    INSERT INTO public.campus_community_follows (follower_id, following_id)
    VALUES (v_user_id, p_following_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, category, action_url, link, metadata, icon)
      VALUES (p_following_id, 'community_new_follower', 'You have a new campus follower',
        COALESCE(NULLIF((SELECT profile.full_name FROM public.profiles AS profile WHERE profile.id = v_user_id), ''), 'A UniEco member') || ' followed your profile.',
        'general', 'https://www.uniecoghana.com/community/member/' || v_user_id::text,
        'https://www.uniecoghana.com/community/member/' || v_user_id::text,
        jsonb_build_object('source', 'campus_community', 'follower_id', v_user_id), 'Users');
    END IF;
  ELSE
    DELETE FROM public.campus_community_follows
    WHERE follower_id = v_user_id AND following_id = p_following_id;
  END IF;
  RETURN p_following;
END
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_post_comments(p_post_id uuid, p_limit integer DEFAULT 60)
RETURNS TABLE (
  id uuid,
  parent_comment_id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_role text,
  body text,
  created_at timestamptz,
  is_mine boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_author_id uuid;
BEGIN
  SELECT post.author_id INTO v_author_id FROM public.campus_community_posts AS post
  WHERE post.id = p_post_id AND post.status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'This post is unavailable' USING ERRCODE = '22023'; END IF;
  IF NOT public.can_use_campus_community(v_author_id) THEN
    RAISE EXCEPTION 'This post is unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_user_id IS NOT NULL AND NOT public.community_users_can_interact(v_user_id, v_author_id) THEN
    RAISE EXCEPTION 'These comments are unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT comment.id, comment.parent_comment_id, author.id,
         COALESCE(NULLIF(btrim(vendor.business_name), ''), NULLIF(btrim(author.full_name), ''), 'Campus member'),
         author.avatar_url, role.name, comment.body, comment.created_at, author.id = v_user_id
  FROM (
    SELECT source.* FROM public.campus_community_comments AS source
    WHERE source.post_id = p_post_id AND source.status = 'published'
      AND (v_user_id IS NULL OR public.community_users_can_interact(v_user_id, source.author_id))
    ORDER BY source.created_at DESC, source.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100)
  ) AS comment
  JOIN public.profiles AS author ON author.id = comment.author_id AND author.is_active AND author.status = 'active'
  JOIN public.user_roles AS role ON role.id = author.role_id
  LEFT JOIN LATERAL (
    SELECT candidate.business_name FROM public.vendors AS candidate
    WHERE candidate.owner_id = author.id AND candidate.is_active
    ORDER BY candidate.created_at DESC, candidate.id LIMIT 1
  ) AS vendor ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.account_restrictions AS restriction
    WHERE restriction.user_id = author.id AND restriction.is_active
      AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
  )
  ORDER BY comment.created_at, comment.id;
END
$$;

CREATE OR REPLACE FUNCTION public.create_campus_community_comment(
  p_post_id uuid, p_body text, p_parent_comment_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_post_author uuid;
  v_parent_author uuid;
  v_comment_id uuid;
  v_body text := btrim(COALESCE(p_body, ''));
  v_rate_count integer;
BEGIN
  IF NOT public.can_use_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Sign in with an active UniEco student or vendor account to comment' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Comments must contain 1–1000 characters' USING ERRCODE = '22023';
  END IF;
  SELECT post.author_id INTO v_post_author FROM public.campus_community_posts AS post
  WHERE post.id = p_post_id AND post.status = 'published';
  IF NOT FOUND OR NOT public.community_users_can_interact(v_user_id, v_post_author) THEN
    RAISE EXCEPTION 'This post is unavailable' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_use_campus_community(v_post_author) THEN
    RAISE EXCEPTION 'This post is unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_parent_comment_id IS NOT NULL THEN
    SELECT comment.author_id INTO v_parent_author
    FROM public.campus_community_comments AS comment
    WHERE comment.id = p_parent_comment_id AND comment.post_id = p_post_id
      AND comment.status = 'published' AND comment.parent_comment_id IS NULL;
    IF NOT FOUND OR NOT public.community_users_can_interact(v_user_id, v_parent_author) THEN
      RAISE EXCEPTION 'Replies can only be added to a visible top-level comment' USING ERRCODE = '22023';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text), 176);
  SELECT count(*) INTO v_rate_count FROM public.campus_community_comments AS comment
  WHERE comment.author_id = v_user_id AND comment.created_at > now() - interval '1 hour';
  IF v_rate_count >= 30 THEN
    RAISE EXCEPTION 'Comment limit reached. Try again later.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.campus_community_comments (post_id, author_id, parent_comment_id, body)
  VALUES (p_post_id, v_user_id, p_parent_comment_id, v_body)
  RETURNING id INTO v_comment_id;

  IF v_post_author <> v_user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, category, action_url, link, metadata, icon)
    VALUES (v_post_author, CASE WHEN p_parent_comment_id IS NULL THEN 'community_post_comment' ELSE 'community_post_reply' END,
      CASE WHEN p_parent_comment_id IS NULL THEN 'New comment on your campus post' ELSE 'New reply on your campus post' END,
      left(v_body, 180), 'general',
      'https://www.uniecoghana.com/?post=' || p_post_id::text,
      'https://www.uniecoghana.com/?post=' || p_post_id::text,
      jsonb_build_object('source', 'campus_community', 'post_id', p_post_id, 'comment_id', v_comment_id), 'MessageCircle');
  END IF;
  IF p_parent_comment_id IS NOT NULL AND v_parent_author IS DISTINCT FROM v_post_author
     AND v_parent_author <> v_user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, category, action_url, link, metadata, icon)
    VALUES (v_parent_author, 'community_comment_reply', 'Someone replied to your comment', left(v_body, 180), 'general',
      'https://www.uniecoghana.com/?post=' || p_post_id::text,
      'https://www.uniecoghana.com/?post=' || p_post_id::text,
      jsonb_build_object('source', 'campus_community', 'post_id', p_post_id, 'comment_id', v_comment_id), 'MessageCircle');
  END IF;
  RETURN v_comment_id;
END
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_member_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  bio text,
  role text,
  university_name text,
  university_slug text,
  verified_student boolean,
  verified_vendor boolean,
  post_count bigint,
  follower_count bigint,
  following_count bigint,
  is_following boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
BEGIN
  IF v_viewer_id IS NOT NULL AND NOT public.community_users_can_interact(v_viewer_id, p_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT profile.id,
    COALESCE(NULLIF(btrim(vendor.business_name), ''), NULLIF(btrim(profile.full_name), ''), 'Campus member'),
    profile.avatar_url, profile.bio, role.name, university.name, university.slug,
    COALESCE(student.is_verified_student, false),
    COALESCE(vendor_profile.verification_status IN ('active', 'verified'), false),
    (SELECT count(*) FROM public.campus_community_posts AS post
      WHERE post.author_id = profile.id AND post.status = 'published'),
    (SELECT count(*) FROM public.campus_community_follows AS follow
      WHERE follow.following_id = profile.id AND public.can_use_campus_community(follow.follower_id)),
    (SELECT count(*) FROM public.campus_community_follows AS follow
      WHERE follow.follower_id = profile.id AND public.can_use_campus_community(follow.following_id)),
    COALESCE(EXISTS (SELECT 1 FROM public.campus_community_follows AS follow
      WHERE follow.follower_id = v_viewer_id AND follow.following_id = profile.id), false)
  FROM public.profiles AS profile
  JOIN public.user_roles AS role ON role.id = profile.role_id
  LEFT JOIN public.universities AS university ON university.id = profile.university_id
  LEFT JOIN public.student_profiles AS student ON student.user_id = profile.id
  LEFT JOIN public.vendor_profiles AS vendor_profile ON vendor_profile.profile_id = profile.id
  LEFT JOIN LATERAL (
    SELECT candidate.business_name FROM public.vendors AS candidate
    WHERE candidate.owner_id = profile.id AND candidate.is_active
    ORDER BY candidate.created_at DESC, candidate.id LIMIT 1
  ) AS vendor ON true
  WHERE profile.id = p_user_id AND public.can_use_campus_community(profile.id);
END
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_member_posts(
  p_user_id uuid, p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL, p_limit integer DEFAULT 8
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
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid feed cursor' USING ERRCODE = '22023';
  END IF;
  IF v_viewer_id IS NOT NULL AND NOT public.community_users_can_interact(v_viewer_id, p_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT post.id, profile.id,
    COALESCE(NULLIF(btrim(vendor.business_name), ''), NULLIF(btrim(profile.full_name), ''), 'Campus member'),
    profile.avatar_url, role.name, university.name, university.slug,
    post.caption, post.media_path, post.media_type, post.created_at
  FROM public.campus_community_posts AS post
  JOIN public.profiles AS profile ON profile.id = post.author_id
  JOIN public.user_roles AS role ON role.id = profile.role_id
  LEFT JOIN public.universities AS university ON university.id = post.university_id
  LEFT JOIN LATERAL (
    SELECT candidate.business_name FROM public.vendors AS candidate
    WHERE candidate.owner_id = profile.id AND candidate.is_active
    ORDER BY candidate.created_at DESC, candidate.id LIMIT 1
  ) AS vendor ON true
  WHERE post.author_id = p_user_id AND post.status = 'published'
    AND public.can_use_campus_community(profile.id)
    AND (v_viewer_id IS NULL OR public.community_users_can_interact(v_viewer_id, profile.id))
    AND (p_before_created_at IS NULL OR (post.created_at, post.id) < (p_before_created_at, p_before_id))
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 12);
END
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_post(p_post_id uuid)
RETURNS TABLE (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_role text,
  university_name text, university_slug text, caption text, media_path text,
  media_type text, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT post.id, profile.id,
    COALESCE(NULLIF(btrim(vendor.business_name), ''), NULLIF(btrim(profile.full_name), ''), 'Campus member'),
    profile.avatar_url, role.name, university.name, university.slug,
    post.caption, post.media_path, post.media_type, post.created_at
  FROM public.campus_community_posts AS post
  JOIN public.profiles AS profile ON profile.id = post.author_id
  JOIN public.user_roles AS role ON role.id = profile.role_id
  LEFT JOIN public.universities AS university ON university.id = post.university_id
  LEFT JOIN LATERAL (
    SELECT candidate.business_name FROM public.vendors AS candidate
    WHERE candidate.owner_id = profile.id AND candidate.is_active
    ORDER BY candidate.created_at DESC, candidate.id LIMIT 1
  ) AS vendor ON true
  WHERE post.id = p_post_id AND post.status = 'published'
    AND public.can_use_campus_community(profile.id)
    AND (auth.uid() IS NULL OR public.community_users_can_interact(auth.uid(), profile.id))
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_saved_posts(
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
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT public.can_use_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Sign in with an active UniEco student or vendor account to view saved posts' USING ERRCODE = '42501';
  END IF;
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid saved-post cursor' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT post.id, author.id,
    COALESCE(NULLIF(btrim(vendor.business_name), ''), NULLIF(btrim(author.full_name), ''), 'Campus member'),
    author.avatar_url, role.name, university.name, university.slug,
    post.caption, post.media_path, post.media_type, post.created_at
  FROM public.campus_community_post_bookmarks AS saved
  JOIN public.campus_community_posts AS post ON post.id = saved.post_id AND post.status = 'published'
  JOIN public.profiles AS author ON author.id = post.author_id
  JOIN public.user_roles AS role ON role.id = author.role_id
  LEFT JOIN public.universities AS university ON university.id = post.university_id
  LEFT JOIN LATERAL (
    SELECT candidate.business_name FROM public.vendors AS candidate
    WHERE candidate.owner_id = author.id AND candidate.is_active
    ORDER BY candidate.created_at DESC, candidate.id LIMIT 1
  ) AS vendor ON true
  WHERE saved.user_id = v_user_id
    AND public.can_use_campus_community(author.id)
    AND public.community_users_can_interact(v_user_id, author.id)
    AND (p_before_created_at IS NULL OR (post.created_at, post.id) < (p_before_created_at, p_before_id))
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 12);
END
$$;

REVOKE ALL ON FUNCTION public.can_use_campus_community(uuid), public.community_users_can_interact(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_publish_campus_community(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_campus_community_post_social_state(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_campus_community_post_like(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_campus_community_post_bookmark(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_campus_community_follow(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_community_post_comments(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_campus_community_comment(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_community_member_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_community_member_posts(uuid, timestamptz, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_community_post(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_community_saved_posts(timestamptz, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campus_community_post_social_state(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_campus_community_post_like(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_campus_community_post_bookmark(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_campus_community_follow(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_post_comments(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_campus_community_comment(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_member_profile(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_member_posts(uuid, timestamptz, uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_post(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_saved_posts(timestamptz, uuid, integer) TO authenticated;

COMMIT;
