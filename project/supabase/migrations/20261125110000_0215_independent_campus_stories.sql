-- Stories are never inserted into campus_community_posts. Drafts reserve a
-- single private object before upload, so failed uploads cannot create posts.
BEGIN;
CREATE TABLE public.campus_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  caption text NOT NULL CHECK (length(caption)<=280),
  ext text NOT NULL CHECK (ext IN ('text','jpg','png','webp','mp4','webm')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  removed boolean NOT NULL DEFAULT false
);
CREATE INDEX campus_stories_recent ON public.campus_stories(published_at DESC) WHERE NOT removed;
CREATE INDEX campus_stories_author ON public.campus_stories(author_id,created_at);
ALTER TABLE public.campus_stories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campus_stories FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.campus_stories TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('campus-stories','campus-stories',false,12582912,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm']);

CREATE FUNCTION public.reserve_campus_story(p_caption text,p_ext text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=auth.uid(); sid uuid;
BEGIN
 IF uid IS NULL OR NOT coalesce(public.can_publish_campus_community(uid),false) THEN RAISE insufficient_privilege; END IF;
 IF p_ext IS NULL OR p_ext NOT IN ('text','jpg','png','webp','mp4','webm') OR length(coalesce(p_caption,''))>280
 OR (p_ext='text' AND btrim(coalesce(p_caption,''))='') THEN RAISE EXCEPTION 'Invalid story'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('campus-story:'||uid::text,0));
 IF (SELECT count(*) FROM public.campus_stories WHERE author_id=uid AND created_at>now()-interval '24 hours')>=12 THEN RAISE EXCEPTION 'Daily story limit reached'; END IF;
 INSERT INTO public.campus_stories(author_id,caption,ext) VALUES(uid,btrim(coalesce(p_caption,'')),p_ext) RETURNING id INTO sid;
 RETURN sid;
END $$;
CREATE FUNCTION public.can_upload_campus_story(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT FROM public.campus_stories s WHERE s.author_id=auth.uid() AND NOT s.removed AND s.published_at IS NULL
 AND s.ext<>'text' AND s.created_at>now()-interval '15 minutes' AND public.can_publish_campus_community(auth.uid())
 AND p_name=s.author_id::text||'/'||s.id::text||'.'||s.ext)
$$;
CREATE POLICY campus_story_reserved_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='campus-stories' AND public.can_upload_campus_story(name));
-- Even a broader, pre-existing permissive bucket policy must not expose Stories.
CREATE POLICY campus_story_private_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket_id<>'campus-stories');
CREATE POLICY campus_story_no_anon_upload ON storage.objects AS RESTRICTIVE FOR INSERT TO anon WITH CHECK(bucket_id<>'campus-stories');
CREATE POLICY campus_story_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'campus-stories' OR public.can_upload_campus_story(name));
CREATE POLICY campus_story_immutable ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id<>'campus-stories') WITH CHECK(bucket_id<>'campus-stories');
CREATE FUNCTION public.publish_campus_story(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.campus_stories s SET published_at=now()
 WHERE s.id=p_id AND s.author_id=auth.uid() AND public.can_publish_campus_community(auth.uid()) AND NOT s.removed
 AND s.published_at IS NULL AND s.created_at>now()-interval '15 minutes'
 AND (s.ext='text' OR EXISTS(SELECT FROM storage.objects o WHERE o.bucket_id='campus-stories'
 AND o.name=s.author_id::text||'/'||s.id::text||'.'||s.ext));
 IF NOT FOUND THEN RAISE EXCEPTION 'Story cannot be published'; END IF;
END $$;
CREATE FUNCTION public.active_campus_stories(p_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,author_name text,mine boolean,caption text,ext text,expires_at timestamptz,media_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT s.id,public.public_profile_display_name(s.author_id),s.author_id=auth.uid(),s.caption,s.ext,
 s.published_at+interval '24 hours',CASE WHEN s.ext<>'text' THEN s.author_id::text||'/'||s.id::text||'.'||s.ext END
 FROM public.campus_stories s JOIN public.profiles p ON p.id=s.author_id
 WHERE auth.uid() IS NOT NULL AND NOT s.removed AND s.published_at>now()-interval '24 hours'
 AND p.is_active AND p.status='active' AND public.can_use_campus_community(s.author_id)
 AND (s.author_id=auth.uid() OR public.community_users_can_interact(auth.uid(),s.author_id))
 AND (p_id IS NULL OR s.id=p_id) ORDER BY s.published_at DESC,s.id LIMIT 60;
$$;
CREATE FUNCTION public.remove_campus_story(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.campus_stories SET removed=true WHERE id=p_id AND (author_id=auth.uid() OR public.is_super_admin());
 IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
END $$;
REVOKE ALL ON FUNCTION public.reserve_campus_story(text,text), public.can_upload_campus_story(text), public.publish_campus_story(uuid),
 public.active_campus_stories(uuid),public.remove_campus_story(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_campus_story(text,text),public.can_upload_campus_story(text),public.publish_campus_story(uuid),
 public.active_campus_stories(uuid),public.remove_campus_story(uuid) TO authenticated;
COMMIT;
