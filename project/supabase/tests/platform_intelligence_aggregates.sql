-- Run only on a disposable database. No telemetry or payment fixtures persist.
BEGIN;

INSERT INTO public.user_roles(id,name) VALUES(2,'student'),(6,'super_admin') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.universities(id,name,short_name,official_name,slug,is_enabled) VALUES
 ('211a0000-0000-4000-8000-000000000001','Intelligence QA Campus','IQAC','Intelligence QA Campus','intelligence-qa-campus',true),
 ('211a0000-0000-4000-8000-000000000002','Private Cohort QA','PCQA','Private Cohort QA','private-cohort-qa',true);
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
SELECT ('211a0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'intelligence-qa-' || i || '@example.test', now(), '{}'::jsonb
FROM generate_series(10, 16) i;

UPDATE public.profiles SET role_id=6 WHERE id='211a0000-0000-4000-8000-000000000016';
UPDATE public.profiles SET university_id='211a0000-0000-4000-8000-000000000001'
WHERE id IN ('211a0000-0000-4000-8000-000000000010','211a0000-0000-4000-8000-000000000011',
  '211a0000-0000-4000-8000-000000000012','211a0000-0000-4000-8000-000000000013',
  '211a0000-0000-4000-8000-000000000014');
UPDATE public.profiles SET university_id='211a0000-0000-4000-8000-000000000002'
WHERE id='211a0000-0000-4000-8000-000000000015';

INSERT INTO public.analytics_events(actor_id,event_type,result_count,occurred_at)
SELECT ('211a0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'search',
  CASE WHEN i = 14 THEN 4 ELSE 0 END,
  date_trunc('day',now(),'UTC') - interval '18 hours'
FROM generate_series(10,15) i CROSS JOIN generate_series(1,3) repeat_event;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_function_privilege(current_user, 'public.get_admin_platform_intelligence(integer)', 'execute') THEN
    RAISE EXCEPTION 'Anonymous caller should not have access';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','211a0000-0000-4000-8000-000000000010',true);
DO $$
BEGIN
  BEGIN
    PERFORM public.get_admin_platform_intelligence(7);
    RAISE EXCEPTION 'An ordinary authenticated member saw private intelligence';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub','211a0000-0000-4000-8000-000000000016',true);
DO $$
DECLARE
  result jsonb := public.get_admin_platform_intelligence(7);
  item jsonb;
BEGIN
  SELECT entry INTO item FROM jsonb_array_elements(result->'campuses') entry WHERE entry->>'slug' = 'intelligence-qa-campus';
  IF item IS NULL OR (item->>'searchDays')::integer IS DISTINCT FROM 5 OR item->'noMatchDays' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'The aggregate must deduplicate repeated searches and withhold a subgroup below five';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result->'campuses') entry WHERE entry->>'slug' = 'private-cohort-qa') THEN
    RAISE EXCEPTION 'Small campus cohorts must not be returned';
  END IF;
  IF result::text LIKE '%@example.test%' OR result::text LIKE '%211a0000%' THEN
    RAISE EXCEPTION 'Internal IDs or emails appeared in report';
  END IF;
  BEGIN
    PERFORM public.get_admin_platform_intelligence(365);
    RAISE EXCEPTION 'Report allowed an unbounded window';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

ROLLBACK;
