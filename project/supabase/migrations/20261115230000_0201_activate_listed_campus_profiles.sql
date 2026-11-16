-- Publish already-enabled, planned campus profiles on UniEco.
-- This is the platform rollout state, not an accreditation determination.
-- Preserve disabled/suspended/onboarding records and every accreditation and role field.
-- Keep the following six profiles public but leave their rollout state alone
-- until their entries and notices at GTEC have been reconciled.
BEGIN;

WITH activated AS (
  UPDATE public.universities
  SET campus_launch_status = 'active', updated_at = now()
  WHERE is_enabled IS TRUE AND campus_launch_status = 'planned'
    AND slug NOT IN (
      'bibiani-college-of-health-sciences',
      'holy-spirit-college-of-education',
      'jayee-university-college',
      'nursing-and-midwifery-training-college-cape-coast',
      'university-college-agriculture-environmental-studies',
      'zenith-university-college'
    )
  RETURNING id
)
INSERT INTO public.audit_logs (target_id, action, entity_type, entity_id, metadata)
SELECT id, 'university.launch_status_set', 'university', id,
       jsonb_build_object('campus_launch_status', 'active', 'previous_status', 'planned', 'migration', '0201')
FROM activated;

COMMIT;
