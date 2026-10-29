-- Keep every admin broadcast actionable across in-app, email, and push.
-- Relative paths are converted to the canonical public origin so email buttons
-- work outside the browser as well.
BEGIN;

CREATE OR REPLACE FUNCTION public.begin_admin_broadcast_delivery(
  p_broadcast_id uuid,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  broadcast_row public.admin_broadcasts%ROWTYPE;
  target public.profiles%ROWTYPE;
  audience_filter text;
  target_ok boolean;
  queued_count integer := 0;
  action_url text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A reason between 10 and 1000 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO broadcast_row
  FROM public.admin_broadcasts
  WHERE id = p_broadcast_id AND status = 'approved'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an approved broadcast may begin delivery' USING ERRCODE = '22023';
  END IF;

  action_url := COALESCE(
    NULLIF(btrim(broadcast_row.target_filters ->> 'action_url'), ''),
    'https://www.uniecoghana.com/dashboard/notifications'
  );
  IF action_url LIKE '/%' THEN
    action_url := 'https://www.uniecoghana.com' || action_url;
  END IF;
  IF action_url !~ '^https://www[.]uniecoghana[.]com(/|$)' THEN
    RAISE EXCEPTION 'Broadcast destination must be a UniEco Ghana URL' USING ERRCODE = '22023';
  END IF;

  UPDATE public.admin_broadcasts
  SET status = 'sending', updated_at = now()
  WHERE id = p_broadcast_id;

  FOR target IN
    SELECT profile.*
    FROM public.profiles profile
    WHERE profile.is_active AND profile.role_id <> 1
  LOOP
    audience_filter := broadcast_row.target_audience;
    target_ok := audience_filter = 'all'
      OR (audience_filter = 'students' AND target.role_id = 2)
      OR (audience_filter = 'vendors' AND target.role_id IN (3, 4))
      OR (audience_filter = 'specific_university' AND target.university_id = (broadcast_row.target_filters ->> 'university_id')::uuid)
      OR (audience_filter = 'specific_category' AND EXISTS (
        SELECT 1 FROM public.vendors vendor
        WHERE vendor.owner_id = target.id
          AND lower(vendor.business_type) = lower(broadcast_row.target_filters ->> 'category')
      ))
      OR (audience_filter = 'selected_users' AND target.id IN (
        SELECT value::uuid
        FROM jsonb_array_elements_text(COALESCE(broadcast_row.target_filters -> 'user_ids', '[]'::jsonb))
      ));

    IF target_ok THEN
      INSERT INTO public.notifications(user_id, type, title, body, action_url, category, metadata, icon)
      VALUES (
        target.id,
        'broadcast',
        broadcast_row.title,
        broadcast_row.body,
        action_url,
        'announcements',
        jsonb_build_object('broadcast_id', p_broadcast_id, 'action_url', action_url),
        'Megaphone'
      );
      PERFORM public.enqueue_trusted_communication_event(
        'broadcast',
        target.id,
        target.email,
        NULL,
        broadcast_row.title,
        broadcast_row.channels,
        jsonb_build_object(
          'template', 'admin_broadcast',
          'name', COALESCE(target.full_name, 'there'),
          'body', broadcast_row.body,
          'broadcast_type', broadcast_row.broadcast_type,
          'broadcast_id', p_broadcast_id,
          'action_url', action_url
        )
      );
      queued_count := queued_count + 1;
    END IF;
  END LOOP;

  UPDATE public.admin_broadcasts
  SET sent_count = queued_count, updated_at = now()
  WHERE id = p_broadcast_id;
  PERFORM public.record_trusted_admin_action(
    'broadcast.delivery_queued',
    'communications',
    'admin_broadcast',
    p_broadcast_id,
    jsonb_build_object('reason', trim(p_reason), 'recipient_count', queued_count, 'action_url', action_url)
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_admin_broadcast_delivery(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_admin_broadcast_delivery(uuid, text) TO authenticated;

COMMIT;
