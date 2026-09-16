-- Phase A3.6.1: server-authoritative broadcast and reminder operations.
BEGIN;

-- Broad browser policies cannot safely govern operational status, approval,
-- delivery, or audit columns. Reads remain RLS-scoped; mutations use RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.admin_broadcasts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_reminders FROM authenticated;
DROP POLICY IF EXISTS admin_broadcasts_staff_manage ON public.admin_broadcasts;
DROP POLICY IF EXISTS event_reminders_own ON public.event_reminders;
CREATE POLICY admin_broadcasts_staff_read ON public.admin_broadcasts
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY event_reminders_own_read ON public.event_reminders
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_admin_broadcast_draft(
  p_title text, p_body text, p_broadcast_type text, p_target_audience text,
  p_target_filters jsonb DEFAULT '{}'::jsonb, p_channels text[] DEFAULT ARRAY['in_app'],
  p_submit_for_approval boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_status text := CASE WHEN COALESCE(p_submit_for_approval, false) THEN 'pending_approval' ELSE 'draft' END;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 200 OR char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid broadcast content' USING ERRCODE = '22023'; END IF;
  IF p_broadcast_type NOT IN ('announcement','maintenance','update','event','promotion') OR p_target_audience NOT IN ('all','students','vendors','specific_university','specific_category','selected_users') THEN RAISE EXCEPTION 'Invalid broadcast classification' USING ERRCODE = '22023'; END IF;
  IF COALESCE(cardinality(p_channels), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(p_channels) AS channel WHERE channel NOT IN ('in_app','email','push','whatsapp','sms')) THEN RAISE EXCEPTION 'Invalid broadcast channels' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.admin_broadcasts (title, body, broadcast_type, target_audience, target_filters, channels, status, created_by)
  VALUES (btrim(p_title), btrim(p_body), p_broadcast_type, p_target_audience, COALESCE(p_target_filters, '{}'::jsonb), p_channels, v_status, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_admin_broadcast_draft(
  p_broadcast_id uuid, p_title text, p_body text, p_target_filters jsonb, p_channels text[]
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 200 OR char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid broadcast content' USING ERRCODE = '22023'; END IF;
  IF COALESCE(cardinality(p_channels), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(p_channels) AS channel WHERE channel NOT IN ('in_app','email','push','whatsapp','sms')) THEN RAISE EXCEPTION 'Invalid broadcast channels' USING ERRCODE = '22023'; END IF;
  UPDATE public.admin_broadcasts SET title=btrim(p_title), body=btrim(p_body), target_filters=COALESCE(p_target_filters, '{}'::jsonb), channels=p_channels, updated_at=now()
  WHERE id=p_broadcast_id AND created_by=auth.uid() AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the creator may edit a draft broadcast' USING ERRCODE = '42501'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_admin_broadcast(p_broadcast_id uuid, p_scheduled_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501'; END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN RAISE EXCEPTION 'Scheduled time must be in the future' USING ERRCODE = '22023'; END IF;
  UPDATE public.admin_broadcasts SET status='scheduled', scheduled_at=p_scheduled_at, updated_at=now()
  WHERE id=p_broadcast_id AND created_by=auth.uid() AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a draft created by the caller may be scheduled' USING ERRCODE = '42501'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.approve_admin_broadcast(p_broadcast_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501'; END IF;
  UPDATE public.admin_broadcasts SET status='approved', approved_by=auth.uid(), approved_at=now(), updated_at=now()
  WHERE id=p_broadcast_id AND status='pending_approval';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a pending broadcast may be approved' USING ERRCODE = '22023'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.begin_admin_broadcast_delivery(p_broadcast_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501'; END IF;
  UPDATE public.admin_broadcasts SET status='sending', updated_at=now()
  WHERE id=p_broadcast_id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an approved broadcast may begin delivery' USING ERRCODE = '22023'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_admin_broadcast(p_broadcast_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501'; END IF;
  UPDATE public.admin_broadcasts SET status='cancelled', updated_at=now()
  WHERE id=p_broadcast_id AND (created_by=auth.uid() OR public.is_super_admin()) AND status IN ('draft','pending_approval','scheduled','approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast cannot be cancelled by the caller' USING ERRCODE = '42501'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_event_reminder(p_event_id uuid, p_reminder_type text, p_custom_minutes_before integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_reminder_type NOT IN ('24h','1h','custom') OR (p_reminder_type='custom' AND (p_custom_minutes_before IS NULL OR p_custom_minutes_before NOT BETWEEN 1 AND 10080)) THEN RAISE EXCEPTION 'Invalid reminder schedule' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id=p_event_id) THEN RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.event_reminders (user_id,event_id,reminder_type,custom_minutes_before)
  VALUES (auth.uid(),p_event_id,p_reminder_type,CASE WHEN p_reminder_type='custom' THEN p_custom_minutes_before ELSE NULL END)
  ON CONFLICT (user_id,event_id,reminder_type) DO UPDATE SET custom_minutes_before=EXCLUDED.custom_minutes_before
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_event_reminder(p_event_id uuid, p_reminder_type text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.event_reminders WHERE user_id=auth.uid() AND event_id=p_event_id AND (p_reminder_type IS NULL OR reminder_type=p_reminder_type);
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.create_admin_broadcast_draft(text,text,text,text,jsonb,text[],boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_admin_broadcast_draft(uuid,text,text,jsonb,text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.schedule_admin_broadcast(uuid,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_admin_broadcast(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_admin_broadcast_delivery(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_admin_broadcast(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.schedule_event_reminder(uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_event_reminder(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_broadcast_draft(text,text,text,text,jsonb,text[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_broadcast_draft(uuid,text,text,jsonb,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_admin_broadcast(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_admin_broadcast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_admin_broadcast_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_admin_broadcast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_event_reminder(uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_event_reminder(uuid,text) TO authenticated;
COMMIT;
