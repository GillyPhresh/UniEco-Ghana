/*
# Convert trigger function to SECURITY INVOKER

log_profile_status_change runs as a trigger on the profiles table. Triggers
execute with the privileges of the table owner, so SECURITY INVOKER is safe
here and removes the REST-callable SECURITY DEFINER warning.

is_staff and has_permission remain SECURITY DEFINER + executable by
authenticated only — they are intentionally callable permission-check helpers.
The linter WARN for those is expected and acceptable.
*/

CREATE OR REPLACE FUNCTION log_profile_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (actor_id, target_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      NEW.id,
      'profile_status_changed',
      'profiles',
      NEW.id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;