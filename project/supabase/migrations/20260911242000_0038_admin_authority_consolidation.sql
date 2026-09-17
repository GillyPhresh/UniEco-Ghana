BEGIN;

-- A3.14: privileged administration is database-authoritative.  These narrow
-- procedures deliberately derive the actor, timestamps and audit record from
-- the authenticated session.  There is no generic "admin mutate" procedure.

CREATE OR REPLACE FUNCTION public.record_trusted_admin_action(
  p_action text, p_module text, p_target_type text, p_target_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.admin_actions (admin_id, action, module, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, p_module, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb));
  INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_target_id, p_action, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.create_admin_university(
  p_name text, p_short_name text, p_slug text, p_city text DEFAULT NULL,
  p_region text DEFAULT NULL, p_country text DEFAULT 'Ghana', p_website_url text DEFAULT NULL,
  p_description text DEFAULT NULL, p_is_enabled boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF NULLIF(trim(p_name),'') IS NULL OR NULLIF(trim(p_short_name),'') IS NULL OR NULLIF(trim(p_slug),'') IS NULL THEN RAISE EXCEPTION 'Name, short name and slug are required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.universities (name,short_name,slug,city,region,country,website_url,description,is_enabled)
  VALUES (trim(p_name),trim(p_short_name),trim(p_slug),NULLIF(trim(p_city),''),NULLIF(trim(p_region),''),COALESCE(NULLIF(trim(p_country),''),'Ghana'),NULLIF(trim(p_website_url),''),NULLIF(trim(p_description),''),COALESCE(p_is_enabled,false)) RETURNING id INTO v_id;
  PERFORM public.record_trusted_admin_action('university.create','universities','university',v_id,jsonb_build_object('slug',trim(p_slug)));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_admin_university(
  p_university_id uuid, p_name text, p_short_name text, p_slug text, p_city text DEFAULT NULL,
  p_region text DEFAULT NULL, p_country text DEFAULT NULL, p_website_url text DEFAULT NULL,
  p_description text DEFAULT NULL, p_logo_alt_text text DEFAULT NULL, p_hero_alt_text text DEFAULT NULL,
  p_image_credit text DEFAULT NULL, p_image_source text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_university(p_university_id) THEN RAISE EXCEPTION 'University administrator access required' USING ERRCODE='42501'; END IF;
  IF NULLIF(trim(p_name),'') IS NULL OR NULLIF(trim(p_short_name),'') IS NULL OR NULLIF(trim(p_slug),'') IS NULL THEN RAISE EXCEPTION 'Name, short name and slug are required' USING ERRCODE='22023'; END IF;
  UPDATE public.universities SET name=trim(p_name),short_name=trim(p_short_name),slug=trim(p_slug),city=NULLIF(trim(p_city),''),region=NULLIF(trim(p_region),''),country=COALESCE(NULLIF(trim(p_country),''),country),website_url=NULLIF(trim(p_website_url),''),description=NULLIF(trim(p_description),''),logo_alt_text=NULLIF(trim(p_logo_alt_text),''),hero_alt_text=NULLIF(trim(p_hero_alt_text),''),image_credit=NULLIF(trim(p_image_credit),''),image_source=NULLIF(trim(p_image_source),''),updated_at=now() WHERE id=p_university_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'University not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.record_trusted_admin_action('university.update','universities','university',p_university_id,'{}');
END $$;

CREATE OR REPLACE FUNCTION public.set_admin_university_enabled(p_university_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  UPDATE public.universities SET is_enabled=p_enabled,updated_at=now() WHERE id=p_university_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'University not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.record_trusted_admin_action('university.enabled_set','universities','university',p_university_id,jsonb_build_object('enabled',p_enabled));
END $$;

CREATE OR REPLACE FUNCTION public.set_admin_university_branding(p_university_id uuid,p_image_type text,p_object_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_slug text; v_column text; v_url text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_university(p_university_id) THEN RAISE EXCEPTION 'University administrator access required' USING ERRCODE='42501'; END IF;
  IF p_image_type NOT IN ('logo','hero') THEN RAISE EXCEPTION 'Invalid image type' USING ERRCODE='22023'; END IF;
  SELECT slug INTO v_slug FROM public.universities WHERE id=p_university_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'University not found' USING ERRCODE='P0002'; END IF;
  IF p_object_path IS NOT NULL AND (p_object_path !~ ('^' || regexp_replace(v_slug,'([\\.\\+\\*\\?\\^\\$\\(\\)\\[\\]\\{\\}\\|\\\\])','\\\\\\1','g') || '/' || p_image_type || '-[0-9]+\\.(jpg|jpeg|png|webp)$') OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='university-branding' AND name=p_object_path)) THEN RAISE EXCEPTION 'Invalid university branding object' USING ERRCODE='22023'; END IF;
  v_column := CASE WHEN p_image_type='logo' THEN 'logo_url' ELSE 'hero_image_url' END;
  v_url := CASE WHEN p_object_path IS NULL THEN NULL ELSE 'https://' || ((current_setting('request.headers', true)::json ->> 'host')) || '/storage/v1/object/public/university-branding/' || p_object_path END;
  IF p_object_path IS NOT NULL AND v_url IS NULL THEN RAISE EXCEPTION 'Unable to resolve storage host' USING ERRCODE='22023'; END IF;
  EXECUTE format('UPDATE public.universities SET %I=$1,updated_at=now() WHERE id=$2',v_column) USING v_url,p_university_id;
  PERFORM public.record_trusted_admin_action(CASE WHEN p_object_path IS NULL THEN 'university.branding_removed' ELSE 'university.branding_set' END,'universities','university',p_university_id,jsonb_build_object('image_type',p_image_type));
END $$;

CREATE OR REPLACE FUNCTION public.create_admin_category(p_name text,p_slug text,p_description text DEFAULT NULL,p_icon text DEFAULT NULL,p_parent_id uuid DEFAULT NULL,p_sort_order integer DEFAULT 0,p_is_visible boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.categories(name,slug,description,icon,parent_id,sort_order,is_visible) VALUES(trim(p_name),trim(p_slug),NULLIF(trim(p_description),''),NULLIF(trim(p_icon),''),p_parent_id,COALESCE(p_sort_order,0),COALESCE(p_is_visible,true)) RETURNING id INTO v_id;
 PERFORM public.record_trusted_admin_action('category.create','categories','category',v_id,'{}'); RETURN v_id; END $$;

CREATE OR REPLACE FUNCTION public.update_admin_category(p_category_id uuid,p_name text,p_slug text,p_description text DEFAULT NULL,p_icon text DEFAULT NULL,p_parent_id uuid DEFAULT NULL,p_sort_order integer DEFAULT 0,p_is_visible boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
 IF p_parent_id=p_category_id OR EXISTS(SELECT 1 FROM public.categories WHERE id=p_parent_id AND parent_id=p_category_id) THEN RAISE EXCEPTION 'Invalid category parent' USING ERRCODE='22023'; END IF;
 UPDATE public.categories SET name=trim(p_name),slug=trim(p_slug),description=NULLIF(trim(p_description),''),icon=NULLIF(trim(p_icon),''),parent_id=p_parent_id,sort_order=COALESCE(p_sort_order,0),is_visible=COALESCE(p_is_visible,true),updated_at=now() WHERE id=p_category_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE='P0002'; END IF; PERFORM public.record_trusted_admin_action('category.update','categories','category',p_category_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.delete_admin_category(p_category_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.categories WHERE parent_id=p_category_id) THEN RAISE EXCEPTION 'Category has child categories' USING ERRCODE='22023'; END IF;
 DELETE FROM public.categories WHERE id=p_category_id; IF NOT FOUND THEN RAISE EXCEPTION 'Category not found' USING ERRCODE='P0002'; END IF; PERFORM public.record_trusted_admin_action('category.delete','categories','category',p_category_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.review_admin_advertisement(p_advertisement_id uuid,p_decision text,p_priority integer DEFAULT 0,p_featured boolean DEFAULT false,p_sponsored boolean DEFAULT false,p_rejection_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_university uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid advertisement decision' USING ERRCODE='22023'; END IF;
 SELECT university_id INTO v_university FROM public.advertisements WHERE id=p_advertisement_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only pending advertisements can be reviewed' USING ERRCODE='22023'; END IF;
 IF public.current_app_role()='university_admin' AND (v_university IS NULL OR NOT public.can_manage_university(v_university)) THEN RAISE EXCEPTION 'University scope required' USING ERRCODE='42501'; END IF;
 IF p_decision='rejected' AND NULLIF(trim(p_rejection_reason),'') IS NULL THEN RAISE EXCEPTION 'Rejection reason required' USING ERRCODE='22023'; END IF;
 UPDATE public.advertisements SET status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=CASE WHEN p_decision='rejected' THEN trim(p_rejection_reason) ELSE NULL END,priority=CASE WHEN p_decision='approved' THEN GREATEST(COALESCE(p_priority,0),0) ELSE priority END,is_featured=CASE WHEN p_decision='approved' THEN COALESCE(p_featured,false) ELSE false END,is_sponsored=CASE WHEN p_decision='approved' THEN COALESCE(p_sponsored,false) ELSE false END WHERE id=p_advertisement_id;
 PERFORM public.record_trusted_admin_action('advertisement.'||p_decision,'advertisements','advertisement',p_advertisement_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.resolve_admin_report(p_report_id uuid,p_resolution_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 UPDATE public.reports SET status='resolved',moderator_id=auth.uid(),resolved_at=now(),resolution_note=NULLIF(trim(p_resolution_note),'') WHERE id=p_report_id AND status='open';
 IF NOT FOUND THEN RAISE EXCEPTION 'Report cannot be resolved from its current status' USING ERRCODE='22023'; END IF; PERFORM public.record_trusted_admin_action('report.resolved','reports','report',p_report_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.add_admin_ticket_reply(p_ticket_id uuid,p_body text,p_is_internal boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 IF NULLIF(trim(p_body),'') IS NULL THEN RAISE EXCEPTION 'Reply body required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.support_tickets WHERE id=p_ticket_id AND status <> 'closed' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Ticket is closed or missing' USING ERRCODE='22023'; END IF;
 INSERT INTO public.ticket_replies(ticket_id,author_id,body,is_internal) VALUES(p_ticket_id,auth.uid(),trim(p_body),COALESCE(p_is_internal,false)) RETURNING id INTO v_id;
 IF NOT COALESCE(p_is_internal,false) THEN UPDATE public.support_tickets SET status='in_progress',updated_at=now() WHERE id=p_ticket_id AND status IN ('open','resolved','in_progress'); END IF;
 PERFORM public.record_trusted_admin_action('support.reply','support','support_ticket',p_ticket_id,jsonb_build_object('internal',COALESCE(p_is_internal,false))); RETURN v_id; END $$;

CREATE OR REPLACE FUNCTION public.assign_admin_support_ticket(p_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 UPDATE public.support_tickets SET assigned_to=auth.uid(),status='in_progress',updated_at=now() WHERE id=p_ticket_id AND status IN ('open','in_progress','resolved');
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket cannot be assigned from its current status' USING ERRCODE='22023'; END IF; PERFORM public.record_trusted_admin_action('support.assigned','support','support_ticket',p_ticket_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.close_admin_support_ticket(p_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 UPDATE public.support_tickets SET status='closed',closed_at=now(),closed_by=auth.uid(),updated_at=now() WHERE id=p_ticket_id AND status IN ('open','in_progress','resolved');
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket cannot be closed from its current status' USING ERRCODE='22023'; END IF; PERFORM public.record_trusted_admin_action('support.closed','support','support_ticket',p_ticket_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.create_admin_cms_page(p_slug text,p_title text,p_content text,p_page_type text,p_meta_description text DEFAULT NULL,p_is_published boolean DEFAULT false,p_sort_order integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.cms_pages(slug,title,content,page_type,meta_description,is_published,published_at,author_id,sort_order) VALUES(trim(p_slug),trim(p_title),p_content,trim(p_page_type),NULLIF(trim(p_meta_description),''),COALESCE(p_is_published,false),CASE WHEN COALESCE(p_is_published,false) THEN now() END,auth.uid(),COALESCE(p_sort_order,0)) RETURNING id INTO v_id; PERFORM public.record_trusted_admin_action('cms.create','cms','cms_page',v_id,'{}'); RETURN v_id; END $$;

CREATE OR REPLACE FUNCTION public.update_admin_cms_page(p_page_id uuid,p_slug text,p_title text,p_content text,p_page_type text,p_meta_description text DEFAULT NULL,p_is_published boolean DEFAULT false,p_sort_order integer DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
 UPDATE public.cms_pages SET slug=trim(p_slug),title=trim(p_title),content=p_content,page_type=trim(p_page_type),meta_description=NULLIF(trim(p_meta_description),''),is_published=COALESCE(p_is_published,false),published_at=CASE WHEN COALESCE(p_is_published,false) AND published_at IS NULL THEN now() WHEN NOT COALESCE(p_is_published,false) THEN NULL ELSE published_at END,sort_order=COALESCE(p_sort_order,0),updated_at=now() WHERE id=p_page_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CMS page not found' USING ERRCODE='P0002'; END IF; PERFORM public.record_trusted_admin_action('cms.update','cms','cms_page',p_page_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.delete_admin_cms_page(p_page_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF; DELETE FROM public.cms_pages WHERE id=p_page_id; IF NOT FOUND THEN RAISE EXCEPTION 'CMS page not found' USING ERRCODE='P0002'; END IF; PERFORM public.record_trusted_admin_action('cms.delete','cms','cms_page',p_page_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.create_admin_faq(p_question text,p_answer text,p_category text DEFAULT 'General',p_sort_order integer DEFAULT 0,p_is_published boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_id uuid; BEGIN IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF; INSERT INTO public.cms_faq_entries(question,answer,category,sort_order,is_published) VALUES(trim(p_question),trim(p_answer),COALESCE(NULLIF(trim(p_category),''),'General'),COALESCE(p_sort_order,0),COALESCE(p_is_published,true)) RETURNING id INTO v_id; PERFORM public.record_trusted_admin_action('faq.create','cms','cms_faq_entry',v_id,'{}'); RETURN v_id; END $$;

CREATE OR REPLACE FUNCTION public.update_admin_faq(p_faq_id uuid,p_question text,p_answer text,p_category text DEFAULT 'General',p_sort_order integer DEFAULT 0,p_is_published boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF; UPDATE public.cms_faq_entries SET question=trim(p_question),answer=trim(p_answer),category=COALESCE(NULLIF(trim(p_category),''),'General'),sort_order=COALESCE(p_sort_order,0),is_published=COALESCE(p_is_published,true),updated_at=now() WHERE id=p_faq_id; IF NOT FOUND THEN RAISE EXCEPTION 'FAQ not found' USING ERRCODE='P0002'; END IF; PERFORM public.record_trusted_admin_action('faq.update','cms','cms_faq_entry',p_faq_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.delete_admin_faq(p_faq_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF; DELETE FROM public.cms_faq_entries WHERE id=p_faq_id; IF NOT FOUND THEN RAISE EXCEPTION 'FAQ not found' USING ERRCODE='P0002'; END IF; PERFORM public.record_trusted_admin_action('faq.delete','cms','cms_faq_entry',p_faq_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.create_admin_announcement(p_title text,p_body text,p_type text,p_target_audience text,p_university_id uuid DEFAULT NULL,p_starts_at timestamptz DEFAULT NULL,p_ends_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 IF p_type NOT IN ('platform','university','maintenance','promotional') OR p_target_audience NOT IN ('all','students','vendors','specific_university') THEN RAISE EXCEPTION 'Invalid announcement type or audience' USING ERRCODE='22023'; END IF;
 IF p_type='university' OR p_target_audience='specific_university' THEN IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN RAISE EXCEPTION 'University scope required' USING ERRCODE='42501'; END IF; ELSIF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required for platform announcements' USING ERRCODE='42501'; END IF;
 IF COALESCE(p_ends_at,now()+interval '7 days') <= COALESCE(p_starts_at,now()) THEN RAISE EXCEPTION 'Announcement end must be after start' USING ERRCODE='22023'; END IF;
 INSERT INTO public.announcements(title,body,type,target_audience,university_id,starts_at,ends_at,created_by) VALUES(trim(p_title),trim(p_body),p_type,p_target_audience,p_university_id,COALESCE(p_starts_at,now()),COALESCE(p_ends_at,now()+interval '7 days'),auth.uid()) RETURNING id INTO v_id; PERFORM public.record_trusted_admin_action('announcement.create','announcements','announcement',v_id,'{}'); RETURN v_id; END $$;

CREATE OR REPLACE FUNCTION public.update_admin_announcement(p_announcement_id uuid,p_title text,p_body text,p_type text,p_target_audience text,p_university_id uuid,p_is_active boolean,p_starts_at timestamptz,p_ends_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_existing_university uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
 SELECT university_id INTO v_existing_university FROM public.announcements WHERE id=p_announcement_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE='P0002'; END IF;
 IF (p_type='university' OR p_target_audience='specific_university' OR v_existing_university IS NOT NULL) THEN IF p_university_id IS NULL OR NOT public.can_manage_university(p_university_id) THEN RAISE EXCEPTION 'University scope required' USING ERRCODE='42501'; END IF; ELSIF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required for platform announcements' USING ERRCODE='42501'; END IF;
 IF p_type NOT IN ('platform','university','maintenance','promotional') OR p_target_audience NOT IN ('all','students','vendors','specific_university') OR p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'Invalid announcement values' USING ERRCODE='22023'; END IF;
 UPDATE public.announcements SET title=trim(p_title),body=trim(p_body),type=p_type,target_audience=p_target_audience,university_id=p_university_id,is_active=COALESCE(p_is_active,true),starts_at=p_starts_at,ends_at=p_ends_at WHERE id=p_announcement_id; PERFORM public.record_trusted_admin_action('announcement.update','announcements','announcement',p_announcement_id,'{}'); END $$;

CREATE OR REPLACE FUNCTION public.delete_admin_announcement(p_announcement_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE v_uni uuid; BEGIN IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF; SELECT university_id INTO v_uni FROM public.announcements WHERE id=p_announcement_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE='P0002'; END IF; IF v_uni IS NULL AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; ELSIF v_uni IS NOT NULL AND NOT public.can_manage_university(v_uni) THEN RAISE EXCEPTION 'University scope required' USING ERRCODE='42501'; END IF; DELETE FROM public.announcements WHERE id=p_announcement_id; PERFORM public.record_trusted_admin_action('announcement.delete','announcements','announcement',p_announcement_id,'{}'); END $$;

-- Direct browser DML is removed for privileged surfaces.  User-owned report
-- and ticket creation/replies retain their narrowly owner-scoped policies.
DROP POLICY IF EXISTS platform_admin_insert_universities ON public.universities;
DROP POLICY IF EXISTS platform_admin_update_universities ON public.universities;
DROP POLICY IF EXISTS university_admin_update_assigned_university ON public.universities;
DROP POLICY IF EXISTS advertisements_staff_manage ON public.advertisements;
DROP POLICY IF EXISTS advertisements_staff_read ON public.advertisements;
DROP POLICY IF EXISTS reports_staff_update ON public.reports;
DROP POLICY IF EXISTS tickets_owner_manage ON public.support_tickets;
DROP POLICY IF EXISTS ticket_replies_staff_insert ON public.ticket_replies;
DROP POLICY IF EXISTS announcements_staff_manage ON public.announcements;
CREATE POLICY support_tickets_owner_read ON public.support_tickets FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_staff());
CREATE POLICY support_tickets_owner_insert ON public.support_tickets FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY support_tickets_staff_read ON public.support_tickets FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY advertisements_staff_read ON public.advertisements FOR SELECT TO authenticated USING(public.is_staff());
CREATE POLICY reports_staff_read ON public.reports FOR SELECT TO authenticated USING(public.is_staff());

CREATE POLICY university_branding_admin_write ON storage.objects FOR ALL TO authenticated
USING (bucket_id='university-branding' AND EXISTS (SELECT 1 FROM public.universities u WHERE u.slug=(storage.foldername(name))[1] AND public.can_manage_university(u.id)))
WITH CHECK (bucket_id='university-branding' AND EXISTS (SELECT 1 FROM public.universities u WHERE u.slug=(storage.foldername(name))[1] AND public.can_manage_university(u.id)));

REVOKE INSERT, UPDATE, DELETE ON public.universities, public.categories, public.advertisements, public.reports, public.cms_pages, public.cms_faq_entries, public.announcements, public.admin_actions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.support_tickets, public.ticket_replies FROM authenticated;
GRANT INSERT ON public.support_tickets TO authenticated;
GRANT INSERT ON public.ticket_replies TO authenticated;

REVOKE ALL ON FUNCTION public.record_trusted_admin_action(text,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_admin_university(text,text,text,text,text,text,text,text,boolean), public.update_admin_university(uuid,text,text,text,text,text,text,text,text,text,text,text,text), public.set_admin_university_enabled(uuid,boolean), public.set_admin_university_branding(uuid,text,text), public.create_admin_category(text,text,text,text,uuid,integer,boolean), public.update_admin_category(uuid,text,text,text,text,uuid,integer,boolean), public.delete_admin_category(uuid), public.review_admin_advertisement(uuid,text,integer,boolean,boolean,text), public.resolve_admin_report(uuid,text), public.add_admin_ticket_reply(uuid,text,boolean), public.assign_admin_support_ticket(uuid), public.close_admin_support_ticket(uuid), public.create_admin_cms_page(text,text,text,text,text,boolean,integer), public.update_admin_cms_page(uuid,text,text,text,text,text,boolean,integer), public.delete_admin_cms_page(uuid), public.create_admin_faq(text,text,text,integer,boolean), public.update_admin_faq(uuid,text,text,text,integer,boolean), public.delete_admin_faq(uuid), public.create_admin_announcement(text,text,text,text,uuid,timestamptz,timestamptz), public.update_admin_announcement(uuid,text,text,text,text,uuid,boolean,timestamptz,timestamptz), public.delete_admin_announcement(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_university(text,text,text,text,text,text,text,text,boolean), public.update_admin_university(uuid,text,text,text,text,text,text,text,text,text,text,text,text), public.set_admin_university_enabled(uuid,boolean), public.set_admin_university_branding(uuid,text,text), public.create_admin_category(text,text,text,text,uuid,integer,boolean), public.update_admin_category(uuid,text,text,text,text,uuid,integer,boolean), public.delete_admin_category(uuid), public.review_admin_advertisement(uuid,text,integer,boolean,boolean,text), public.resolve_admin_report(uuid,text), public.add_admin_ticket_reply(uuid,text,boolean), public.assign_admin_support_ticket(uuid), public.close_admin_support_ticket(uuid), public.create_admin_cms_page(text,text,text,text,text,boolean,integer), public.update_admin_cms_page(uuid,text,text,text,text,text,boolean,integer), public.delete_admin_cms_page(uuid), public.create_admin_faq(text,text,text,integer,boolean), public.update_admin_faq(uuid,text,text,text,integer,boolean), public.delete_admin_faq(uuid), public.create_admin_announcement(text,text,text,text,uuid,timestamptz,timestamptz), public.update_admin_announcement(uuid,text,text,text,text,uuid,boolean,timestamptz,timestamptz), public.delete_admin_announcement(uuid) TO authenticated;

COMMIT;
