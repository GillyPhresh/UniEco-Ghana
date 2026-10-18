-- Referral settlement schedule.
-- The reward remains pending for seven days; this job only transitions due,
-- already-qualified rewards to available through the protected ledger function.

DO $$
BEGIN
  -- The hosted production project has pg_cron enabled. Some local Supabase
  -- images do not ship the cron schema, so local migration validation should
  -- still succeed without silently pretending a scheduler exists.
  IF to_regnamespace('cron') IS NOT NULL THEN
    EXECUTE $schedule$
      SELECT cron.schedule(
        'settle-student-referral-rewards-every-15-minutes',
        '*/15 * * * *',
        'SELECT public.settle_due_student_referral_rewards(250);'
      )
      WHERE NOT EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname = 'settle-student-referral-rewards-every-15-minutes'
      )
    $schedule$;
  END IF;
END $$;
