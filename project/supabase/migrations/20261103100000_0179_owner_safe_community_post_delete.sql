BEGIN;

CREATE OR REPLACE FUNCTION public.delete_my_campus_community_post(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_media_path text;
  v_attachment_path text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to delete your post' USING ERRCODE = '42501';
  END IF;

  SELECT post.media_path, post.attachment_path
  INTO v_media_path, v_attachment_path
  FROM public.campus_community_posts AS post
  WHERE post.id = p_post_id
    AND post.author_id = v_actor_id
    AND post.status = 'published'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.campus_community_posts
  SET status = 'removed', removed_at = pg_catalog.now()
  WHERE id = p_post_id
    AND author_id = v_actor_id
    AND status = 'published';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = 'campus-community'
    AND name = v_media_path
    AND v_media_path IS NOT NULL;

  DELETE FROM storage.objects
  WHERE bucket_id = 'campus-community-files'
    AND name = v_attachment_path
    AND v_attachment_path IS NOT NULL;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_actor_id,
    'community_post_deleted_by_owner',
    'campus_community_post',
    p_post_id,
    jsonb_build_object('removed_by_owner', true)
  );

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.delete_my_campus_community_post(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_campus_community_post(uuid) TO authenticated;

COMMIT;
