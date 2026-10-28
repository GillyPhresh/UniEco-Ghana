-- Super-admin-only, allowlisted platform settings with immutable change history.
-- This is a control plane for safe configuration, not a generic SQL/code editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('boolean', 'text', 'number', 'enum')),
  value jsonb NOT NULL,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_editable boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_setting_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid NOT NULL REFERENCES public.platform_settings(id) ON DELETE RESTRICT,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_setting_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings, public.platform_setting_changes FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.platform_settings (setting_key, label, description, value_type, value, validation)
VALUES
  ('home.university_showcase_enabled', 'University showcase', 'Allow the home experience to show the university discovery section.', 'boolean', 'true'::jsonb, '{}'::jsonb),
  ('campus_mate.enabled', 'Campus Mate', 'Allow the Campus Mate experience to be available in navigation.', 'boolean', 'true'::jsonb, '{}'::jsonb),
  ('campus_mate.public_place_discovery_enabled', 'Public place discovery', 'Allow approved public-place discovery integrations to return reviewable places.', 'boolean', 'true'::jsonb, '{}'::jsonb),
  ('directory.show_planned_institutions', 'Show planned institutions', 'Keep institutions marked planned visible in the public directory.', 'boolean', 'true'::jsonb, '{}'::jsonb),
  ('ui.mobile_first_layout', 'Mobile-first layout', 'Keep mobile-first layout treatments enabled across supported modules.', 'boolean', 'true'::jsonb, '{}'::jsonb),
  ('communications.ai_draft_scanning_enabled', 'AI draft scanning', 'Allow the private Super Admin AI to prepare communication drafts from trusted sources.', 'boolean', 'true'::jsonb, '{}'::jsonb),
  ('site.maintenance_banner', 'Maintenance banner', 'Optional short banner text for a planned maintenance notice. Leave empty when unused.', 'text', '""'::jsonb, '{"maxLength":240}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_admin_platform_settings()
RETURNS TABLE (
  setting_id uuid,
  setting_key text,
  label text,
  description text,
  value_type text,
  value jsonb,
  validation jsonb,
  is_editable boolean,
  updated_at timestamptz,
  updated_by uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT setting.id, setting.setting_key, setting.label, setting.description,
         setting.value_type, setting.value, setting.validation, setting.is_editable,
         setting.updated_at, setting.updated_by
  FROM public.platform_settings setting
  ORDER BY setting.setting_key;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_platform_setting_history(p_limit integer DEFAULT 50)
RETURNS TABLE (
  change_id uuid,
  setting_key text,
  label text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT change.id, setting.setting_key, setting.label, change.old_value,
         change.new_value, change.reason, change.changed_by,
         COALESCE(profile.full_name, 'Super Admin'), change.created_at
  FROM public.platform_setting_changes change
  JOIN public.platform_settings setting ON setting.id = change.setting_id
  LEFT JOIN public.profiles profile ON profile.id = change.changed_by
  ORDER BY change.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END $$;

CREATE OR REPLACE FUNCTION public.update_admin_platform_setting(
  p_setting_key text,
  p_value jsonb,
  p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  setting public.platform_settings%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
  value_text text;
  allowed_values jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A change reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO setting
  FROM public.platform_settings
  WHERE setting_key = btrim(COALESCE(p_setting_key, ''))
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Setting is not allowlisted' USING ERRCODE = '22023'; END IF;
  IF NOT setting.is_editable THEN RAISE EXCEPTION 'This setting is locked' USING ERRCODE = '42501'; END IF;
  IF p_value IS NULL THEN RAISE EXCEPTION 'A setting value is required' USING ERRCODE = '22023'; END IF;

  IF setting.value_type = 'boolean' AND jsonb_typeof(p_value) <> 'boolean' THEN
    RAISE EXCEPTION 'This setting requires a boolean value' USING ERRCODE = '22023';
  ELSIF setting.value_type = 'number' AND jsonb_typeof(p_value) <> 'number' THEN
    RAISE EXCEPTION 'This setting requires a number value' USING ERRCODE = '22023';
  ELSIF setting.value_type IN ('text', 'enum') AND jsonb_typeof(p_value) <> 'string' THEN
    RAISE EXCEPTION 'This setting requires text' USING ERRCODE = '22023';
  END IF;

  IF setting.value_type = 'text' THEN
    value_text := trim(both '"' from p_value::text);
    IF char_length(value_text) > COALESCE((setting.validation->>'maxLength')::integer, 500) THEN
      RAISE EXCEPTION 'Text value is too long' USING ERRCODE = '22023';
    END IF;
  ELSIF setting.value_type = 'enum' THEN
    allowed_values := setting.validation->'allowedValues';
    IF allowed_values IS NULL OR NOT (allowed_values ? trim(both '"' from p_value::text)) THEN
      RAISE EXCEPTION 'Value is not allowed for this setting' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF setting.value IS NOT DISTINCT FROM p_value THEN RETURN true; END IF;
  INSERT INTO public.platform_setting_changes(setting_id, old_value, new_value, reason, changed_by)
  VALUES (setting.id, setting.value, p_value, reason, auth.uid());
  UPDATE public.platform_settings
  SET value = p_value, updated_by = auth.uid(), updated_at = now()
  WHERE id = setting.id;
  PERFORM public.record_trusted_admin_action('platform_setting.update', 'platform_settings', 'platform_setting', setting.id,
    jsonb_build_object('setting_key', setting.setting_key, 'reason', reason));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.rollback_admin_platform_setting_change(
  p_change_id uuid,
  p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  change public.platform_setting_changes%ROWTYPE;
  setting public.platform_settings%ROWTYPE;
  reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A rollback reason between 10 and 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO change FROM public.platform_setting_changes WHERE id = p_change_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Setting change was not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO setting FROM public.platform_settings WHERE id = change.setting_id FOR UPDATE;
  IF NOT FOUND OR NOT setting.is_editable THEN RAISE EXCEPTION 'Setting cannot be rolled back' USING ERRCODE = '42501'; END IF;
  IF setting.value IS NOT DISTINCT FROM change.old_value THEN RETURN true; END IF;

  INSERT INTO public.platform_setting_changes(setting_id, old_value, new_value, reason, changed_by)
  VALUES (setting.id, setting.value, change.old_value, 'Rollback: ' || reason, auth.uid());
  UPDATE public.platform_settings
  SET value = change.old_value, updated_by = auth.uid(), updated_at = now()
  WHERE id = setting.id;
  PERFORM public.record_trusted_admin_action('platform_setting.rollback', 'platform_settings', 'platform_setting', setting.id,
    jsonb_build_object('setting_key', setting.setting_key, 'source_change_id', p_change_id, 'reason', reason));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.get_admin_platform_settings(), public.get_admin_platform_setting_history(integer),
  public.update_admin_platform_setting(text, jsonb, text), public.rollback_admin_platform_setting_change(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_platform_settings(), public.get_admin_platform_setting_history(integer),
  public.update_admin_platform_setting(text, jsonb, text), public.rollback_admin_platform_setting_change(uuid, text)
  TO authenticated;

COMMIT;
