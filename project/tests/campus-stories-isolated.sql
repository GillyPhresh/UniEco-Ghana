-- Run ONLY in a new, empty local test database with psql -v ON_ERROR_STOP=1.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, is_active boolean DEFAULT true,status text DEFAULT 'active');
CREATE TABLE storage.objects(bucket_id text,name text);
CREATE TABLE storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.can_publish_campus_community(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION public.community_users_can_interact(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1<>'00000000-0000-4000-8000-000000000003'::uuid $$;
CREATE FUNCTION public.can_use_campus_community(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.public_profile_display_name(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'Nickname'::text $$;
CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
\ir ../supabase/migrations/20261125110000_0215_independent_campus_stories.sql
INSERT INTO public.profiles(id) VALUES('00000000-0000-4000-8000-000000000001');
SET test.uid='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT public.reserve_campus_story('Test text','text') AS sid \gset
SELECT public.publish_campus_story(:'sid');
DO $$ BEGIN IF (SELECT count(*) FROM public.active_campus_stories())<>1 THEN RAISE EXCEPTION 'story not visible'; END IF; END $$;
SELECT public.reserve_campus_story('Photo','jpg') AS pic \gset
SELECT public.can_upload_campus_story('00000000-0000-4000-8000-000000000001/'||:'pic'||'.jpg') AS authorized \gset
\if :authorized
\else
\quit 1
\endif
SET test.uid='00000000-0000-4000-8000-000000000002';
DO $$ BEGIN
 BEGIN PERFORM public.reserve_campus_story('Unauthorized','text'); RAISE EXCEPTION 'buyer posted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.remove_campus_story((SELECT id FROM public.active_campus_stories() LIMIT 1)); RAISE EXCEPTION 'wrong owner removed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET test.uid='00000000-0000-4000-8000-000000000003';
DO $$ BEGIN IF EXISTS(SELECT FROM public.active_campus_stories()) THEN RAISE EXCEPTION 'blocked viewer saw story'; END IF; END $$;
RESET ROLE;
UPDATE public.campus_stories SET published_at=now()-interval '24 hours' WHERE id=:'sid';
SET ROLE authenticated;
SET test.uid='00000000-0000-4000-8000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT FROM public.active_campus_stories()) THEN RAISE EXCEPTION 'expired story visible'; END IF; END $$;
