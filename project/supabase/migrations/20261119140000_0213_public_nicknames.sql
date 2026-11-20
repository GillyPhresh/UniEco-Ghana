-- Separate a user's public identity from the legal/account name used by
-- private payment, support, moderation, and management workflows.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_nickname text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_public_nickname_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_public_nickname_check CHECK (
    public_nickname IS NULL OR (
      public_nickname = btrim(public_nickname)
      AND char_length(public_nickname) BETWEEN 2 AND 30
      AND public_nickname !~ '[[:cntrl:]]'
    )
  );

GRANT UPDATE (public_nickname) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.public_profile_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(v.business_name), '') FROM public.vendors AS v
      WHERE v.owner_id = p_user_id AND v.is_active
      ORDER BY v.created_at DESC, v.id LIMIT 1),
    (SELECT NULLIF(btrim(p.public_nickname), '') FROM public.profiles AS p WHERE p.id = p_user_id),
    'Campus member'
  )
$$;
REVOKE ALL ON FUNCTION public.public_profile_display_name(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_campus_community_feed(
  p_scope text DEFAULT 'all', p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL, p_limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid, author_id uuid, author_name text, author_avatar_url text, author_role text,
  university_name text, university_slug text, caption text, media_path text,
  media_type text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user_id uuid := auth.uid(); v_university_id uuid;
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN ('all','university') THEN
    RAISE EXCEPTION 'Invalid community feed scope' USING ERRCODE='22023';
  END IF;
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid feed cursor' USING ERRCODE='22023';
  END IF;
  IF p_scope='university' THEN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in to view your university feed' USING ERRCODE='42501'; END IF;
    SELECT profile.university_id INTO v_university_id FROM public.profiles AS profile
      WHERE profile.id=v_user_id AND profile.is_active AND profile.status='active';
    IF NOT FOUND OR v_university_id IS NULL THEN
      RAISE EXCEPTION 'Add your university to your profile to use this feed' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN QUERY
  SELECT post.id, author.id, public.public_profile_display_name(author.id), author.avatar_url,
    role.name, university.name, university.slug, post.caption, post.media_path, post.media_type, post.created_at
  FROM public.campus_community_posts AS post
  JOIN public.profiles AS author ON author.id=post.author_id
  JOIN public.user_roles AS role ON role.id=author.role_id
  LEFT JOIN public.universities AS university ON university.id=post.university_id
  WHERE post.status='published' AND author.is_active AND author.status='active'
    AND public.can_use_campus_community(author.id)
    AND (p_scope='all' OR post.university_id=v_university_id)
    AND (v_user_id IS NULL OR public.community_users_can_interact(v_user_id,author.id))
    AND (p_before_created_at IS NULL OR (post.created_at,post.id)<(p_before_created_at,p_before_id))
  ORDER BY post.created_at DESC,post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit,8),1),12);
END $$;

CREATE OR REPLACE FUNCTION public.get_campus_community_post_comments(p_post_id uuid,p_limit integer DEFAULT 60)
RETURNS TABLE (id uuid,parent_comment_id uuid,author_id uuid,author_name text,author_avatar_url text,
  author_role text,body text,created_at timestamptz,is_mine boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user_id uuid := auth.uid(); v_author_id uuid;
BEGIN
  SELECT post.author_id INTO v_author_id FROM public.campus_community_posts AS post
    WHERE post.id=p_post_id AND post.status='published';
  IF NOT FOUND OR NOT public.can_use_campus_community(v_author_id) THEN
    RAISE EXCEPTION 'This post is unavailable' USING ERRCODE='22023';
  END IF;
  IF v_user_id IS NOT NULL AND NOT public.community_users_can_interact(v_user_id,v_author_id) THEN
    RAISE EXCEPTION 'These comments are unavailable' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT comment.id,comment.parent_comment_id,author.id,public.public_profile_display_name(author.id),
    author.avatar_url,role.name,comment.body,comment.created_at,author.id=v_user_id
  FROM (SELECT source.* FROM public.campus_community_comments AS source
    WHERE source.post_id=p_post_id AND source.status='published'
      AND (v_user_id IS NULL OR public.community_users_can_interact(v_user_id,source.author_id))
    ORDER BY source.created_at DESC,source.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,60),1),100)) AS comment
  JOIN public.profiles AS author ON author.id=comment.author_id AND author.is_active AND author.status='active'
  JOIN public.user_roles AS role ON role.id=author.role_id
  WHERE public.can_use_campus_community(author.id)
  ORDER BY comment.created_at,comment.id;
END $$;

CREATE OR REPLACE FUNCTION public.set_campus_community_follow(p_following_id uuid,p_following boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user_id uuid:=auth.uid(); v_inserted integer;
BEGIN
  IF NOT public.can_use_campus_community(v_user_id) THEN
    RAISE EXCEPTION 'Sign in with an active UniEco student or vendor account to follow members' USING ERRCODE='42501';
  END IF;
  IF p_following_id IS NULL OR p_following_id=v_user_id
     OR NOT public.can_use_campus_community(p_following_id)
     OR NOT public.community_users_can_interact(v_user_id,p_following_id) THEN
    RAISE EXCEPTION 'This member cannot be followed' USING ERRCODE='22023';
  END IF;
  IF p_following THEN
    INSERT INTO public.campus_community_follows(follower_id,following_id)
      VALUES(v_user_id,p_following_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    IF v_inserted>0 THEN
      INSERT INTO public.notifications(user_id,type,title,body,category,action_url,link,metadata,icon)
      VALUES(p_following_id,'community_new_follower','You have a new campus follower',
        public.public_profile_display_name(v_user_id)||' followed your profile.','general',
        'https://www.uniecoghana.com/community/member/'||v_user_id::text,
        'https://www.uniecoghana.com/community/member/'||v_user_id::text,
        jsonb_build_object('source','campus_community','follower_id',v_user_id),'Users');
    END IF;
  ELSE
    DELETE FROM public.campus_community_follows WHERE follower_id=v_user_id AND following_id=p_following_id;
  END IF;
  RETURN p_following;
END $$;

CREATE OR REPLACE FUNCTION public.get_campus_community_member_profile(p_user_id uuid)
RETURNS TABLE (id uuid,display_name text,avatar_url text,bio text,role text,university_name text,
  university_slug text,verified_student boolean,verified_vendor boolean,post_count bigint,
  follower_count bigint,following_count bigint,is_following boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_viewer_id uuid := auth.uid();
BEGIN
  IF v_viewer_id IS NOT NULL AND NOT public.community_users_can_interact(v_viewer_id,p_user_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT profile.id,public.public_profile_display_name(profile.id),profile.avatar_url,profile.bio,role.name,
    university.name,university.slug,COALESCE(student.is_verified_student,false),
    COALESCE(vendor_profile.verification_status IN ('active','verified'),false),
    (SELECT count(*) FROM public.campus_community_posts AS post WHERE post.author_id=profile.id AND post.status='published'),
    (SELECT count(*) FROM public.campus_community_follows AS f WHERE f.following_id=profile.id AND public.can_use_campus_community(f.follower_id)),
    (SELECT count(*) FROM public.campus_community_follows AS f WHERE f.follower_id=profile.id AND public.can_use_campus_community(f.following_id)),
    COALESCE(EXISTS(SELECT 1 FROM public.campus_community_follows AS f WHERE f.follower_id=v_viewer_id AND f.following_id=profile.id),false)
  FROM public.profiles AS profile JOIN public.user_roles AS role ON role.id=profile.role_id
  LEFT JOIN public.universities AS university ON university.id=profile.university_id
  LEFT JOIN public.student_profiles AS student ON student.user_id=profile.id
  LEFT JOIN public.vendor_profiles AS vendor_profile ON vendor_profile.profile_id=profile.id
  WHERE profile.id=p_user_id AND public.can_use_campus_community(profile.id);
END $$;

CREATE OR REPLACE FUNCTION public.get_campus_community_member_posts(
  p_user_id uuid,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 8
)
RETURNS TABLE (id uuid,author_id uuid,author_name text,author_avatar_url text,author_role text,
  university_name text,university_slug text,caption text,media_path text,media_type text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_viewer_id uuid := auth.uid();
BEGIN
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid feed cursor' USING ERRCODE='22023'; END IF;
  IF v_viewer_id IS NOT NULL AND NOT public.community_users_can_interact(v_viewer_id,p_user_id) THEN RETURN; END IF;
  RETURN QUERY SELECT post.id,profile.id,public.public_profile_display_name(profile.id),profile.avatar_url,
    role.name,university.name,university.slug,post.caption,post.media_path,post.media_type,post.created_at
  FROM public.campus_community_posts AS post JOIN public.profiles AS profile ON profile.id=post.author_id
  JOIN public.user_roles AS role ON role.id=profile.role_id
  LEFT JOIN public.universities AS university ON university.id=post.university_id
  WHERE post.author_id=p_user_id AND post.status='published' AND public.can_use_campus_community(profile.id)
    AND (v_viewer_id IS NULL OR public.community_users_can_interact(v_viewer_id,profile.id))
    AND (p_before_created_at IS NULL OR (post.created_at,post.id)<(p_before_created_at,p_before_id))
  ORDER BY post.created_at DESC,post.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,8),1),12);
END $$;

CREATE OR REPLACE FUNCTION public.get_campus_community_post(p_post_id uuid)
RETURNS TABLE (id uuid,author_id uuid,author_name text,author_avatar_url text,author_role text,
  university_name text,university_slug text,caption text,media_path text,media_type text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT post.id,profile.id,public.public_profile_display_name(profile.id),profile.avatar_url,role.name,
    university.name,university.slug,post.caption,post.media_path,post.media_type,post.created_at
  FROM public.campus_community_posts AS post JOIN public.profiles AS profile ON profile.id=post.author_id
  JOIN public.user_roles AS role ON role.id=profile.role_id
  LEFT JOIN public.universities AS university ON university.id=post.university_id
  WHERE post.id=p_post_id AND post.status='published' AND public.can_use_campus_community(profile.id)
    AND (auth.uid() IS NULL OR public.community_users_can_interact(auth.uid(),profile.id))
$$;

CREATE OR REPLACE FUNCTION public.get_campus_community_saved_posts(
  p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 8
)
RETURNS TABLE (id uuid,author_id uuid,author_name text,author_avatar_url text,author_role text,
  university_name text,university_slug text,caption text,media_path text,media_type text,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF NOT public.can_use_campus_community(v_user_id) THEN RAISE EXCEPTION 'Sign in with an active UniEco student or vendor account to view saved posts' USING ERRCODE='42501'; END IF;
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid saved-post cursor' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT post.id,author.id,public.public_profile_display_name(author.id),author.avatar_url,
    role.name,university.name,university.slug,post.caption,post.media_path,post.media_type,post.created_at
  FROM public.campus_community_post_bookmarks AS saved
  JOIN public.campus_community_posts AS post ON post.id=saved.post_id AND post.status='published'
  JOIN public.profiles AS author ON author.id=post.author_id JOIN public.user_roles AS role ON role.id=author.role_id
  LEFT JOIN public.universities AS university ON university.id=post.university_id
  WHERE saved.user_id=v_user_id AND public.can_use_campus_community(author.id)
    AND public.community_users_can_interact(v_user_id,author.id)
    AND (p_before_created_at IS NULL OR (post.created_at,post.id)<(p_before_created_at,p_before_id))
  ORDER BY post.created_at DESC,post.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,8),1),12);
END $$;

CREATE OR REPLACE FUNCTION public.get_message_conversation_recipient(p_conversation_id uuid)
RETURNS TABLE (id uuid,full_name text,avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_caller uuid:=auth.uid(); v_other_user_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT CASE WHEN c.participant_one=v_caller THEN c.participant_two WHEN c.participant_two=v_caller THEN c.participant_one END
    INTO v_other_user_id FROM public.conversations AS c
    WHERE c.id=p_conversation_id AND v_caller IN (c.participant_one,c.participant_two);
  IF NOT FOUND OR v_other_user_id IS NULL THEN RAISE EXCEPTION 'Conversation access denied' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.id,public.public_profile_display_name(p.id),p.avatar_url FROM public.profiles AS p
    WHERE p.id=v_other_user_id AND p.is_active AND p.status='active';
END $$;

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
      AND COALESCE(p.public_nickname,'') ILIKE '%'||v_query||'%'
      AND NOT EXISTS(SELECT 1 FROM public.account_restrictions r WHERE r.user_id=p.id AND r.is_active AND (r.ends_at IS NULL OR r.ends_at>now()))
      AND NOT EXISTS(SELECT 1 FROM public.blocked_users b WHERE (b.blocker_id=v_caller AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v_caller))
    UNION ALL
    SELECT v.owner_id,public.public_profile_display_name(v.owner_id),v.logo_url,'business'::text,'Business'::text
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

CREATE OR REPLACE FUNCTION public.search_message_recipients(p_query text,p_limit integer DEFAULT 10)
RETURNS TABLE (id uuid,full_name text,avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY SELECT c.id,c.full_name,c.avatar_url FROM public.search_message_contacts(p_query,p_limit) c WHERE c.kind='student';
END $$;

REVOKE ALL ON FUNCTION public.get_campus_community_feed(text,timestamptz,uuid,integer),
  public.get_campus_community_post_comments(uuid,integer),public.get_campus_community_member_profile(uuid),
  public.get_campus_community_member_posts(uuid,timestamptz,uuid,integer),public.get_campus_community_post(uuid),
  public.get_campus_community_saved_posts(timestamptz,uuid,integer),public.set_campus_community_follow(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campus_community_feed(text,timestamptz,uuid,integer),
  public.get_campus_community_post_comments(uuid,integer),public.get_campus_community_member_profile(uuid),
  public.get_campus_community_member_posts(uuid,timestamptz,uuid,integer),public.get_campus_community_post(uuid)
  TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_community_saved_posts(timestamptz,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_campus_community_follow(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_message_conversation_recipient(uuid),
  public.search_message_contacts(text,integer),public.search_message_recipients(text,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_message_conversation_recipient(uuid),
  public.search_message_contacts(text,integer),public.search_message_recipients(text,integer) TO authenticated;

COMMIT;
