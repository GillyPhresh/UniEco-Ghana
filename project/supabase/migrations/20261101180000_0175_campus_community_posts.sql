-- Public student/vendor campus community feed. Identity and campus are always
-- derived from the authenticated profile; callers cannot impersonate authors.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campus-community',
  'campus-community',
  true,
  26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.campus_community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id uuid REFERENCES public.universities(id) ON DELETE SET NULL,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 500),
  media_path text NOT NULL CHECK (char_length(media_path) <= 240),
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS campus_community_feed_order_idx
  ON public.campus_community_posts (created_at DESC, id DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS campus_community_university_order_idx
  ON public.campus_community_posts (university_id, created_at DESC, id DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS public.campus_community_post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.campus_community_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'abuse', 'unsafe', 'misleading', 'other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution text CHECK (resolution IS NULL OR resolution IN ('keep', 'remove')),
  resolution_note text CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id),
  CHECK ((status = 'open') = (reviewed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS campus_community_reports_queue_idx
  ON public.campus_community_post_reports (created_at ASC)
  WHERE status = 'open';

ALTER TABLE public.campus_community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_community_post_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_community_posts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.campus_community_post_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.campus_community_posts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.campus_community_post_reports TO service_role;

CREATE OR REPLACE FUNCTION public.can_upload_campus_community_media()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.id = profile.role_id
    WHERE profile.id = auth.uid()
      AND profile.is_active AND profile.status = 'active'
      AND role.name IN ('student', 'student_vendor', 'external_vendor')
      AND NOT EXISTS (
        SELECT 1 FROM public.account_restrictions AS restriction
        WHERE restriction.user_id = profile.id AND restriction.is_active
          AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
      )
  )
$$;

DROP POLICY IF EXISTS campus_community_owner_upload ON storage.objects;
CREATE POLICY campus_community_owner_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campus-community'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$')
    AND public.can_upload_campus_community_media()
  );

DROP POLICY IF EXISTS campus_community_owner_delete ON storage.objects;
CREATE POLICY campus_community_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campus-community'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.get_campus_community_feed(
  p_scope text DEFAULT 'all',
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_role text,
  university_name text,
  university_slug text,
  caption text,
  media_path text,
  media_type text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_university_id uuid;
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN ('all', 'university') THEN
    RAISE EXCEPTION 'Invalid community feed scope' USING ERRCODE = '22023';
  END IF;
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid feed cursor' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'university' THEN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Sign in to view your university feed' USING ERRCODE = '42501';
    END IF;
    SELECT profile.university_id INTO v_university_id
    FROM public.profiles AS profile
    WHERE profile.id = v_user_id AND profile.is_active AND profile.status = 'active';
    IF NOT FOUND OR v_university_id IS NULL THEN
      RAISE EXCEPTION 'Add your university to your profile to use this feed' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
  SELECT post.id,
         author.id,
         COALESCE(NULLIF(btrim(vendor.business_name), ''), NULLIF(btrim(author.full_name), ''), 'Campus member'),
         author.avatar_url,
         role.name,
         university.name,
         university.slug,
         post.caption,
         post.media_path,
         post.media_type,
         post.created_at
  FROM public.campus_community_posts AS post
  JOIN public.profiles AS author ON author.id = post.author_id
  JOIN public.user_roles AS role ON role.id = author.role_id
  LEFT JOIN public.universities AS university ON university.id = post.university_id
  LEFT JOIN LATERAL (
    SELECT candidate.business_name
    FROM public.vendors AS candidate
    WHERE candidate.owner_id = author.id AND candidate.is_active
    ORDER BY candidate.created_at DESC, candidate.id
    LIMIT 1
  ) AS vendor ON true
  WHERE post.status = 'published'
    AND author.is_active AND author.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.account_restrictions AS restriction
      WHERE restriction.user_id = author.id AND restriction.is_active
        AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
    )
    AND (p_scope = 'all' OR post.university_id = v_university_id)
    AND (
      v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.blocked_users AS block
        WHERE (block.blocker_id = v_user_id AND block.blocked_id = author.id)
           OR (block.blocker_id = author.id AND block.blocked_id = v_user_id)
      )
    )
    AND (
      p_before_created_at IS NULL
      OR (post.created_at, post.id) < (p_before_created_at, p_before_id)
    )
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 12);
END
$$;

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
  v_role_id smallint;
  v_caption text := btrim(COALESCE(p_caption, ''));
  v_extension text;
  v_post_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to share a campus post' USING ERRCODE = '42501';
  END IF;
  SELECT profile.university_id, profile.role_id
    INTO v_university_id, v_role_id
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id
    AND profile.is_active AND profile.status = 'active';
  IF NOT FOUND OR v_role_id NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'An active student or vendor account is required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.account_restrictions AS restriction
    WHERE restriction.user_id = v_user_id AND restriction.is_active
      AND (restriction.ends_at IS NULL OR restriction.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'Posting is unavailable for this account' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_caption) > 500 OR (v_caption = '' AND p_media_path IS NULL) THEN
    RAISE EXCEPTION 'A post needs media and a caption of no more than 500 characters' USING ERRCODE = '22023';
  END IF;
  IF p_media_path IS NULL OR char_length(p_media_path) > 240
     OR p_media_path !~ ('^' || v_user_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$')
     OR p_media_type NOT IN ('image', 'video') THEN
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
  IF (
    SELECT count(*) FROM public.campus_community_posts AS post
    WHERE post.author_id = v_user_id
      AND post.created_at > now() - interval '1 hour'
  ) >= 12 THEN
    RAISE EXCEPTION 'You have reached the hourly posting limit. Try again later.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.campus_community_posts (author_id, university_id, caption, media_path, media_type)
  VALUES (v_user_id, v_university_id, v_caption, p_media_path, p_media_type)
  RETURNING id INTO v_post_id;
  RETURN v_post_id;
END
$$;

CREATE OR REPLACE FUNCTION public.report_campus_community_post(
  p_post_id uuid,
  p_reason text,
  p_details text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_report_id uuid;
  v_details text := btrim(COALESCE(p_details, ''));
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = v_user_id AND profile.is_active AND profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Sign in with an active account to report a post' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('spam', 'abuse', 'unsafe', 'misleading', 'other')
     OR char_length(v_details) > 500 THEN
    RAISE EXCEPTION 'Invalid report details' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.campus_community_posts AS post
    WHERE post.id = p_post_id AND post.status = 'published' AND post.author_id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'This post cannot be reported' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.campus_community_post_reports (post_id, reporter_id, reason, details)
  VALUES (p_post_id, v_user_id, p_reason, v_details)
  ON CONFLICT (post_id, reporter_id) DO UPDATE
    SET reason = EXCLUDED.reason, details = EXCLUDED.details, status = 'open',
        resolution = NULL, resolution_note = NULL, reviewed_by = NULL,
        reviewed_at = NULL, created_at = now()
  RETURNING id INTO v_report_id;
  RETURN v_report_id;
END
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_post_reports(
  p_status text DEFAULT 'open',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  report_id uuid,
  post_id uuid,
  post_caption text,
  media_path text,
  media_type text,
  author_name text,
  reporter_name text,
  reason text,
  details text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.has_permission('can_moderate_content')) THEN
    RAISE EXCEPTION 'Content moderation access required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('open', 'resolved', 'dismissed', 'all') THEN
    RAISE EXCEPTION 'Invalid report filter' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT report.id, post.id, post.caption, post.media_path, post.media_type,
         COALESCE(NULLIF(author.full_name, ''), 'Campus member'),
         COALESCE(NULLIF(reporter.full_name, ''), 'Campus member'),
         report.reason, report.details, report.status, report.created_at
  FROM public.campus_community_post_reports AS report
  JOIN public.campus_community_posts AS post ON post.id = report.post_id
  JOIN public.profiles AS author ON author.id = post.author_id
  JOIN public.profiles AS reporter ON reporter.id = report.reporter_id
  WHERE (p_status = 'all' OR report.status = p_status)
  ORDER BY CASE WHEN report.status = 'open' THEN 0 ELSE 1 END, report.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END
$$;

CREATE OR REPLACE FUNCTION public.moderate_campus_community_post_report(
  p_report_id uuid,
  p_decision text,
  p_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_post_id uuid;
  v_note text := btrim(COALESCE(p_note, ''));
BEGIN
  IF v_actor_id IS NULL OR NOT (public.is_super_admin() OR public.has_permission('can_moderate_content')) THEN
    RAISE EXCEPTION 'Content moderation access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('keep', 'remove') OR char_length(v_note) < 10 OR char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Choose a decision and enter a 10–500 character moderation note' USING ERRCODE = '22023';
  END IF;
  SELECT report.post_id INTO v_post_id
  FROM public.campus_community_post_reports AS report
  WHERE report.id = p_report_id AND report.status = 'open'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This report has already been reviewed' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'remove' THEN
    UPDATE public.campus_community_posts
    SET status = 'removed', removed_at = now()
    WHERE id = v_post_id AND status = 'published';
    DELETE FROM storage.objects AS uploaded_media
    USING public.campus_community_posts AS post
    WHERE post.id = v_post_id
      AND uploaded_media.bucket_id = 'campus-community'
      AND uploaded_media.name = post.media_path;
  END IF;
  UPDATE public.campus_community_post_reports
  SET status = 'resolved', resolution = p_decision, resolution_note = v_note,
      reviewed_by = v_actor_id, reviewed_at = now()
  WHERE id = p_report_id;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor_id, 'community_post_' || p_decision, 'campus_community_post', v_post_id,
          jsonb_build_object('report_id', p_report_id, 'note', v_note));
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.get_campus_community_feed(text, timestamptz, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_upload_campus_community_media() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_campus_community_post(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_campus_community_post(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campus_community_post_reports(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_campus_community_post_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campus_community_feed(text, timestamptz, uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_campus_community_media() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campus_community_post(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_campus_community_post(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_post_reports(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_campus_community_post_report(uuid, text, text) TO authenticated;

COMMIT;
