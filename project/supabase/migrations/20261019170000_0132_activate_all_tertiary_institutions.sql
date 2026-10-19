-- The nationwide directory is ready for use. Activate every enabled tertiary
-- institution so directory status matches the platform launch decision.
BEGIN;

UPDATE public.universities
SET campus_launch_status = 'active',
    updated_at = now()
WHERE is_enabled = true;

COMMIT;
