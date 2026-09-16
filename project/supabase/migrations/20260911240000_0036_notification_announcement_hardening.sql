-- Phase A3.6.2: narrow user notification and announcement mutations.
BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_preferences FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.university_announcements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.business_announcements FROM authenticated;
DROP POLICY IF EXISTS university_announcements_scoped_manage ON public.university_announcements;
DROP POLICY IF EXISTS business_announcements_vendor_manage ON public.business_announcements;
CREATE POLICY university_announcements_scoped_read ON public.university_announcements FOR SELECT TO authenticated USING (is_active OR public.can_manage_university(university_id));
CREATE POLICY business_announcements_vendor_read ON public.business_announcements FOR SELECT TO authenticated USING (is_approved OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id=vendor_id AND v.owner_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.set_own_notification_read_state(p_notification_id uuid, p_is_read boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 UPDATE public.notifications SET is_read=COALESCE(p_is_read,false) WHERE id=p_notification_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification access denied' USING ERRCODE='42501'; END IF; RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.mark_all_own_notifications_read(p_category text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_count integer; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 UPDATE public.notifications SET is_read=true WHERE user_id=auth.uid() AND NOT is_read AND (p_category IS NULL OR category=p_category);
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END $$;
CREATE OR REPLACE FUNCTION public.dismiss_own_notification(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 DELETE FROM public.notifications WHERE id=p_notification_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification access denied' USING ERRCODE='42501'; END IF; RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.set_own_notification_preferences(p_preferences jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object' THEN RAISE EXCEPTION 'Preferences must be an object' USING ERRCODE='22023'; END IF;
 INSERT INTO public.notification_preferences(user_id,preferences) VALUES(auth.uid(),p_preferences)
 ON CONFLICT(user_id) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=now() RETURNING id INTO v_id; RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.create_university_announcement(p_university_id uuid,p_title text,p_body text,p_announcement_type text DEFAULT 'general',p_is_pinned boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_university(p_university_id) THEN RAISE EXCEPTION 'University administrator access required' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 200 OR char_length(btrim(COALESCE(p_body,''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid announcement content' USING ERRCODE='22023'; END IF;
 INSERT INTO public.university_announcements(university_id,title,body,announcement_type,is_pinned,created_by) VALUES(p_university_id,btrim(p_title),btrim(p_body),p_announcement_type,COALESCE(p_is_pinned,false),auth.uid()) RETURNING id INTO v_id; RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.create_own_business_announcement(p_vendor_id uuid,p_title text,p_body text,p_announcement_type text,p_image_url text DEFAULT NULL,p_starts_at timestamptz DEFAULT NULL,p_ends_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=p_vendor_id AND v.owner_id=auth.uid()) THEN RAISE EXCEPTION 'Vendor access denied' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 200 OR char_length(btrim(COALESCE(p_body,''))) NOT BETWEEN 1 AND 10000 OR p_announcement_type NOT IN ('new_product','holiday_hours','temporary_closure','special_promotion','general') THEN RAISE EXCEPTION 'Invalid announcement' USING ERRCODE='22023'; END IF;
 INSERT INTO public.business_announcements(vendor_id,title,body,announcement_type,image_url,starts_at,ends_at,is_active,is_approved) VALUES(p_vendor_id,btrim(p_title),btrim(p_body),p_announcement_type,p_image_url,p_starts_at,p_ends_at,true,false) RETURNING id INTO v_id; RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.update_own_business_announcement(p_announcement_id uuid,p_title text,p_body text,p_announcement_type text,p_image_url text,p_starts_at timestamptz,p_ends_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 UPDATE public.business_announcements a SET title=COALESCE(NULLIF(btrim(p_title),''),a.title),body=COALESCE(NULLIF(btrim(p_body),''),a.body),announcement_type=COALESCE(p_announcement_type,a.announcement_type),image_url=p_image_url,starts_at=p_starts_at,ends_at=p_ends_at,is_approved=false,reviewed_by=NULL,reviewed_at=NULL,updated_at=now()
 WHERE a.id=p_announcement_id AND NOT a.is_approved AND EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=a.vendor_id AND v.owner_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Only an unapproved vendor announcement may be edited' USING ERRCODE='42501'; END IF; RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.delete_own_business_announcement(p_announcement_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 DELETE FROM public.business_announcements a WHERE a.id=p_announcement_id AND NOT a.is_approved AND EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=a.vendor_id AND v.owner_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Only an unapproved vendor announcement may be deleted' USING ERRCODE='42501'; END IF; RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.set_own_notification_read_state(uuid,boolean),public.mark_all_own_notifications_read(text),public.dismiss_own_notification(uuid),public.set_own_notification_preferences(jsonb),public.create_university_announcement(uuid,text,text,text,boolean),public.create_own_business_announcement(uuid,text,text,text,text,timestamptz,timestamptz),public.update_own_business_announcement(uuid,text,text,text,text,timestamptz,timestamptz),public.delete_own_business_announcement(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_own_notification_read_state(uuid,boolean),public.mark_all_own_notifications_read(text),public.dismiss_own_notification(uuid),public.set_own_notification_preferences(jsonb),public.create_university_announcement(uuid,text,text,text,boolean),public.create_own_business_announcement(uuid,text,text,text,text,timestamptz,timestamptz),public.update_own_business_announcement(uuid,text,text,text,text,timestamptz,timestamptz),public.delete_own_business_announcement(uuid) TO authenticated;
COMMIT;
