-- Add private, download-only attachments to campus community posts.
-- Public image/video media remains MIME- and size-restricted in its own bucket.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('campus-community-files', 'campus-community-files', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = NULL;

ALTER TABLE public.campus_community_posts
  ALTER COLUMN media_path DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS campus_community_posts_media_type_check,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint;

ALTER TABLE public.campus_community_posts
  ADD CONSTRAINT campus_community_post_asset_check CHECK (
    (media_type IN ('image', 'video')
      AND media_path IS NOT NULL
      AND attachment_path IS NULL AND attachment_name IS NULL AND attachment_size IS NULL)
    OR
    (media_type = 'file'
      AND media_path IS NULL
      AND attachment_path IS NOT NULL
      AND attachment_name IS NOT NULL AND char_length(btrim(attachment_name)) BETWEEN 1 AND 180
      AND attachment_name !~ '[[:cntrl:]/\\]'
      AND attachment_size BETWEEN 1 AND 52428800)
    OR
    (media_type = 'text'
      AND media_path IS NULL
      AND attachment_path IS NULL AND attachment_name IS NULL AND attachment_size IS NULL
      AND char_length(btrim(caption)) > 0)
  );

CREATE INDEX IF NOT EXISTS campus_community_private_attachment_idx
  ON public.campus_community_posts (attachment_path)
  WHERE media_type = 'file' AND status = 'published';

CREATE OR REPLACE FUNCTION public.can_read_campus_community_attachment(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_path IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.campus_community_posts AS post
    WHERE post.attachment_path = p_path
      AND post.media_type = 'file'
      AND post.status = 'published'
      AND (
        (public.can_use_campus_community(auth.uid())
          AND public.community_users_can_interact(auth.uid(), post.author_id))
        OR public.is_super_admin()
        OR public.has_permission('can_moderate_content')
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_read_campus_community_attachment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_campus_community_attachment(text) TO authenticated;

DROP POLICY IF EXISTS campus_community_files_owner_upload ON storage.objects;
CREATE POLICY campus_community_files_owner_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campus-community-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    AND public.can_upload_campus_community_media()
  );

DROP POLICY IF EXISTS campus_community_files_owner_delete ON storage.objects;
CREATE POLICY campus_community_files_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campus-community-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS campus_community_files_authorized_read ON storage.objects;
CREATE POLICY campus_community_files_authorized_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campus-community-files'
    AND public.can_read_campus_community_attachment(name)
  );

CREATE OR REPLACE FUNCTION public.create_campus_community_post_with_attachment(
  p_caption text,
  p_media_path text,
  p_media_type text,
  p_attachment_path text,
  p_attachment_name text,
  p_attachment_size bigint
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
  v_post_id uuid;
  v_stored_type text;
  v_actual_size bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to share a campus post' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_publish_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Complete UniEco verification before publishing campus posts' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_caption) > 500 THEN
    RAISE EXCEPTION 'A caption must be no more than 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT profile.university_id INTO v_university_id
  FROM public.profiles AS profile WHERE profile.id = v_user_id;

  IF p_attachment_path IS NOT NULL THEN
    v_stored_type := 'file';
    IF p_media_path IS NOT NULL OR p_media_type IS NOT NULL
       OR p_attachment_path !~ ('^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       OR p_attachment_name IS NULL OR char_length(btrim(p_attachment_name)) NOT BETWEEN 1 AND 180
       OR p_attachment_name ~ '[[:cntrl:]/\\]'
       OR p_attachment_size IS NULL OR p_attachment_size NOT BETWEEN 1 AND 52428800 THEN
      RAISE EXCEPTION 'Invalid file attachment' USING ERRCODE = '22023';
    END IF;
    SELECT CASE
      WHEN COALESCE(object.metadata ->> 'size', '') ~ '^[0-9]+$'
        THEN (object.metadata ->> 'size')::bigint
      ELSE NULL
    END
    INTO v_actual_size
    FROM storage.objects AS object
    WHERE object.bucket_id = 'campus-community-files'
      AND object.name = p_attachment_path
      AND (storage.foldername(object.name))[1] = v_user_id::text;
    IF NOT FOUND OR v_actual_size IS DISTINCT FROM p_attachment_size THEN
      RAISE EXCEPTION 'Upload the attachment from this account before posting' USING ERRCODE = '22023';
    END IF;
  ELSIF p_media_path IS NOT NULL THEN
    v_stored_type := p_media_type;
    IF char_length(p_media_path) > 240
       OR p_media_path !~ ('^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|webm)$')
       OR p_media_type IS NULL OR p_media_type NOT IN ('image', 'video')
       OR p_attachment_name IS NOT NULL OR p_attachment_size IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid community media' USING ERRCODE = '22023';
    END IF;
    IF (p_media_type = 'image' AND lower(substring(p_media_path FROM '\.([a-z0-9]+)$')) NOT IN ('jpg', 'jpeg', 'png', 'webp'))
       OR (p_media_type = 'video' AND lower(substring(p_media_path FROM '\.([a-z0-9]+)$')) NOT IN ('mp4', 'webm')) THEN
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
  ELSE
    v_stored_type := 'text';
    IF v_caption = '' OR p_media_type IS NOT NULL OR p_attachment_name IS NOT NULL OR p_attachment_size IS NOT NULL THEN
      RAISE EXCEPTION 'A text post needs a caption' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  IF (SELECT count(*) FROM public.campus_community_posts AS post
      WHERE post.author_id = v_user_id AND post.created_at > now() - interval '1 hour') >= 12 THEN
    RAISE EXCEPTION 'You have reached the hourly posting limit. Try again later.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.campus_community_posts (
    author_id, university_id, caption, media_path, media_type,
    attachment_path, attachment_name, attachment_size
  ) VALUES (
    v_user_id, v_university_id, v_caption, p_media_path, v_stored_type,
    p_attachment_path, CASE WHEN p_attachment_path IS NULL THEN NULL ELSE btrim(p_attachment_name) END,
    p_attachment_size
  ) RETURNING id INTO v_post_id;
  RETURN v_post_id;
END
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_post_file_info(p_post_id uuid)
RETURNS TABLE (file_path text, file_name text, file_size bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to download this attachment' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT post.attachment_path, post.attachment_name, post.attachment_size
  FROM public.campus_community_posts AS post
  WHERE post.id = p_post_id
    AND post.media_type = 'file'
    AND post.status = 'published'
    AND public.can_read_campus_community_attachment(post.attachment_path);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This attachment is not available to your account' USING ERRCODE = '42501';
  END IF;
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
SET search_path = pg_catalog, public, storage
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
    DELETE FROM storage.objects AS uploaded_attachment
    USING public.campus_community_posts AS post
    WHERE post.id = v_post_id
      AND uploaded_attachment.bucket_id = 'campus-community-files'
      AND uploaded_attachment.name = post.attachment_path;
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

REVOKE ALL ON FUNCTION public.create_campus_community_post_with_attachment(text, text, text, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_campus_community_post_file_info(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderate_campus_community_post_report(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_campus_community_post_with_attachment(text, text, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_post_file_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_campus_community_post_report(uuid, text, text) TO authenticated;

COMMIT;
