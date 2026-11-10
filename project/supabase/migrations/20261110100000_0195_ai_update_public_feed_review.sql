-- Prepare a trusted-source AI lead for both human-review workflows in one
-- transaction: the public Campus Updates queue and an optional in-app
-- broadcast draft. Neither workflow publishes or sends automatically.
BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_admin_ai_update(
  p_title text,
  p_summary text,
  p_source_url text,
  p_source_label text,
  p_broadcast_title text,
  p_broadcast_body text,
  p_target_audience text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  source_row public.campus_feed_sources%ROWTYPE;
  feed_item_id uuid;
  feed_item_status text;
  broadcast_id uuid;
  broadcast_status text;
  source_host text;
  normalized_host text;
  clean_title text := btrim(regexp_replace(COALESCE(p_title, ''), '<[^>]*>', '', 'g'));
  clean_summary text := left(btrim(regexp_replace(COALESCE(p_summary, ''), '<[^>]*>', '', 'g')), 600);
  clean_broadcast_title text := btrim(COALESCE(p_broadcast_title, ''));
  clean_broadcast_body text := btrim(COALESCE(p_broadcast_body, ''));
  canonical_url text := btrim(COALESCE(p_source_url, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF length(clean_title) NOT BETWEEN 8 AND 220
     OR length(clean_summary) > 600
     OR length(clean_broadcast_title) NOT BETWEEN 1 AND 200
     OR length(clean_broadcast_body) NOT BETWEEN 1 AND 10000
     OR p_target_audience IS NULL
     OR p_target_audience NOT IN ('all', 'students', 'vendors') THEN
    RAISE EXCEPTION 'Invalid trusted update content or audience' USING ERRCODE = '22023';
  END IF;
  IF length(canonical_url) > 2048
     OR canonical_url !~ '^https://[A-Za-z0-9.-]+(/|$)'
     OR canonical_url ~ '^https://[^/?#]*:'
     OR canonical_url ~ '[[:space:]<>"''{}|\\^`]'
     OR canonical_url ~ '#'
     OR canonical_url ~* '^https://[^/]*@' THEN
    RAISE EXCEPTION 'Only canonical HTTPS source URLs are allowed' USING ERRCODE = '22023';
  END IF;

  source_host := lower(split_part(split_part(canonical_url, '://', 2), '/', 1));
  normalized_host := regexp_replace(source_host, '^www[.]', '');
  SELECT source.* INTO source_row
  FROM public.campus_feed_sources AS source
  WHERE source.enabled
    AND (source_host = lower(source.source_domain)
      OR normalized_host = lower(source.source_domain)
      OR source_host LIKE '%.' || lower(source.source_domain))
  ORDER BY length(source.source_domain) DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This trusted site is not enabled for the public Campus Updates feed' USING ERRCODE = '22023';
  END IF;

  -- Reuse an existing source record where possible. Never resurrect a story
  -- that an administrator has already rejected.
  SELECT item.id, item.status INTO feed_item_id, feed_item_status
  FROM public.campus_feed_items AS item
  WHERE item.source_id = source_row.id AND item.canonical_url = canonical_url
  ORDER BY (item.status = 'approved') DESC, item.fetched_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.campus_feed_items (
      source_id, source_item_key, source_label, university_name,
      title, excerpt, canonical_url, category, status
    ) VALUES (
      source_row.id,
      encode(extensions.digest(convert_to(canonical_url, 'UTF8'), 'sha256'), 'hex'),
      source_row.label,
      source_row.university_name,
      clean_title,
      clean_summary,
      canonical_url,
      CASE WHEN source_row.source_kind = 'opportunities' THEN 'opportunities' ELSE 'news' END,
      'pending'
    )
    ON CONFLICT (source_id, source_item_key) DO NOTHING
    RETURNING id, status INTO feed_item_id, feed_item_status;

    IF feed_item_id IS NULL THEN
      SELECT item.id, item.status INTO feed_item_id, feed_item_status
      FROM public.campus_feed_items AS item
      WHERE item.source_id = source_row.id
        AND item.source_item_key = encode(extensions.digest(convert_to(canonical_url, 'UTF8'), 'sha256'), 'hex')
      FOR UPDATE;
    END IF;
  END IF;

  IF feed_item_status = 'rejected' THEN
    RAISE EXCEPTION 'This source item was previously rejected and cannot be re-queued' USING ERRCODE = '22023';
  END IF;

  -- Repeated AI scans of the same canonical source reuse an existing
  -- non-cancelled broadcast instead of creating duplicate notifications.
  SELECT broadcast.id, broadcast.status INTO broadcast_id, broadcast_status
  FROM public.admin_broadcasts AS broadcast
  WHERE broadcast.target_filters ->> 'source_url' = canonical_url
    AND broadcast.status <> 'cancelled'
  ORDER BY broadcast.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    broadcast_id := public.create_admin_broadcast_draft(
      clean_broadcast_title,
      clean_broadcast_body,
      'update',
      p_target_audience,
      jsonb_build_object(
        'ai_generated', false,
        'draft_mode', 'source_fallback',
        'source_url', canonical_url,
        'source_label', left(btrim(COALESCE(p_source_label, source_row.label)), 160),
        'campus_feed_item_id', feed_item_id,
        'action_url', '/updates'
      ),
      ARRAY['in_app']::text[],
      true
    );
    broadcast_status := 'pending_approval';
  END IF;

  PERFORM public.record_trusted_admin_action(
    'ai_update.review_prepared',
    'communications',
    'campus_feed_item',
    feed_item_id,
    jsonb_build_object(
      'broadcast_id', broadcast_id,
      'source_id', source_row.id,
      'source_url', canonical_url,
      'feed_status', feed_item_status,
      'broadcast_status', broadcast_status
    )
  );

  RETURN jsonb_build_object(
    'feedItemId', feed_item_id,
    'feedStatus', feed_item_status,
    'broadcastId', broadcast_id,
    'broadcastStatus', broadcast_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_admin_ai_update(text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_admin_ai_update(text, text, text, text, text, text, text)
  TO authenticated;

COMMIT;
