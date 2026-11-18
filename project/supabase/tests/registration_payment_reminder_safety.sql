-- Run in a disposable database only. This test does not dispatch providers.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(13);

INSERT INTO public.user_roles(id, name) VALUES (2, 'student'), (6, 'super_admin') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_financial_settings(singleton, registration_fee, vendor_registration_fee) VALUES (true, 10, 20)
ON CONFLICT (singleton) DO UPDATE SET registration_fee = 10, vendor_registration_fee = 20;
INSERT INTO public.universities(id, name, slug, is_enabled)
VALUES ('208a0000-0000-4000-8000-000000000001', 'Reminder QA College', 'reminder-qa-college', true);
INSERT INTO auth.users(id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('208a0000-0000-4000-8000-000000000002', 'reminder-staff@example.test', now(), '{"registration_intent":"student"}'),
  ('208a0000-0000-4000-8000-000000000003', 'reminder-buyer@example.test', now(), '{"registration_intent":"buyer"}'),
  ('208a0000-0000-4000-8000-000000000004', 'reminder-seller@example.test', now(), '{"registration_intent":"student"}'),
  ('208a0000-0000-4000-8000-000000000005', 'reminder-unconfirmed@example.test', NULL, '{"registration_intent":"student"}');
UPDATE public.profiles SET role_id = 6 WHERE id = '208a0000-0000-4000-8000-000000000002';

SELECT ok(NOT has_function_privilege('authenticated', 'public.registration_reminder_context(uuid)', 'EXECUTE'), 'eligibility is server-only');
SELECT ok(NOT has_table_privilege('authenticated', 'public.registration_paystack_checkouts', 'SELECT'), 'hosted links are not browser readable');
SELECT ok(has_table_privilege('service_role', 'public.registration_paystack_checkouts', 'SELECT'), 'backend can read hosted links');
SELECT is(public.registration_reminder_context('208a0000-0000-4000-8000-000000000002'), NULL::jsonb, 'staff with previous seller intent is exempt');
SELECT is(public.registration_reminder_context('208a0000-0000-4000-8000-000000000003'), NULL::jsonb, 'buyer owes no fee');
SELECT is(public.registration_reminder_context('208a0000-0000-4000-8000-000000000004'), NULL::jsonb, 'seller without saved details is not reminded');

UPDATE public.profiles SET phone = '0240000000' WHERE id IN (
  '208a0000-0000-4000-8000-000000000004', '208a0000-0000-4000-8000-000000000005');
INSERT INTO public.student_profiles(user_id, university_id) VALUES
  ('208a0000-0000-4000-8000-000000000004', '208a0000-0000-4000-8000-000000000001'),
  ('208a0000-0000-4000-8000-000000000005', '208a0000-0000-4000-8000-000000000001')
ON CONFLICT (user_id) DO UPDATE SET university_id = EXCLUDED.university_id;
SELECT is(public.registration_reminder_context('208a0000-0000-4000-8000-000000000005'), NULL::jsonb, 'unconfirmed email is ineligible even with saved details');
SELECT is(public.registration_reminder_context('208a0000-0000-4000-8000-000000000004')->>'action_url',
  'https://www.uniecoghana.com/payments/registration-checkout?role=student', 'eligible seller gets the canonical checkout URL');

SELECT public.queue_registration_payment_reminders(500);
SELECT public.queue_registration_payment_reminders(500);
SELECT is((SELECT count(*) FROM public.notifications WHERE type = 'registration_payment_required'
  AND user_id = '208a0000-0000-4000-8000-000000000004'), 1::bigint, 'daily reminder remains deduplicated');
SELECT is((SELECT count(*) FROM public.notifications WHERE type = 'registration_payment_required'
  AND user_id IN ('208a0000-0000-4000-8000-000000000002', '208a0000-0000-4000-8000-000000000003',
    '208a0000-0000-4000-8000-000000000005')), 0::bigint, 'in-app reminders exclude exempt accounts');

INSERT INTO public.communication_events(id, event_type, recipient_id, recipient_email, channels, created_at) VALUES
  ('208a0000-0000-4000-8000-000000000006', 'registration_payment_required', '208a0000-0000-4000-8000-000000000002',
   'old-staff-address@example.test', ARRAY['email'], '2000-01-01'),
  ('208a0000-0000-4000-8000-000000000007', 'registration_payment_required', '208a0000-0000-4000-8000-000000000004',
   'old-seller-address@example.test', ARRAY['email'], '2000-01-01');
INSERT INTO public.communication_deliveries(event_id, channel) VALUES
  ('208a0000-0000-4000-8000-000000000006', 'email'), ('208a0000-0000-4000-8000-000000000007', 'email');
CREATE TEMP TABLE reminder_claim_test AS SELECT * FROM public.claim_trusted_communication_events(25);
SELECT is((SELECT status FROM public.communication_events WHERE id = '208a0000-0000-4000-8000-000000000006'),
  'cancelled', 'a queued reminder for an exempt member is cancelled at claim');
SELECT is((SELECT count(*) FROM reminder_claim_test WHERE event_id = '208a0000-0000-4000-8000-000000000006'),
  0::bigint, 'worker never receives the exempt reminder');
SELECT is((SELECT recipient_email || ' ' || (metadata->>'action_url') FROM reminder_claim_test
  WHERE event_id = '208a0000-0000-4000-8000-000000000007'),
  'reminder-seller@example.test https://www.uniecoghana.com/payments/registration-checkout?role=student',
  'worker uses confirmed email and canonical checkout for an eligible account');

SELECT * FROM finish();
ROLLBACK;
