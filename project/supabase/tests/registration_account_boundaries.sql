-- Execute only in an isolated/local test database with migration 0204 applied.
-- No network/provider requests are made; trusted status updates are fixtures.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT no_plan();

INSERT INTO public.user_roles(id, name)
VALUES (2, 'student'), (3, 'student_vendor'), (4, 'external_vendor')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.student_financial_settings(singleton, registration_fee, vendor_registration_fee)
VALUES (true, 10, 10)
ON CONFLICT (singleton) DO UPDATE SET registration_fee = 10, vendor_registration_fee = 10;
INSERT INTO public.universities(id, name, short_name, official_name, slug, is_enabled)
VALUES ('289a0000-0000-4000-8000-000000000001', 'Registration QA College', 'QA College',
  'Registration QA College', 'registration-qa-college', true);
INSERT INTO auth.users(id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('289a0000-0000-4000-8000-000000000002', 'buyer@example.test', now(), '{"registration_intent":"buyer"}'),
  ('289a0000-0000-4000-8000-000000000003', 'seller@example.test', now(), '{"registration_intent":"student"}'),
  ('289a0000-0000-4000-8000-000000000004', 'business@example.test', now(), '{"registration_intent":"external_vendor"}'),
  ('289a0000-0000-4000-8000-000000000005', 'oauth@example.test', now(), '{}'),
  ('289a0000-0000-4000-8000-000000000006', 'offers@example.test', now(), '{"registration_intent":"buyer"}');

INSERT INTO public.payment_providers(name, display_name, is_enabled, supported_methods, sort_order)
VALUES ('manual', 'Pay on receipt', true, ARRAY['bank_transfer'], 99),
  ('paystack', 'Paystack', true, ARRAY['card'], 2)
ON CONFLICT (name) DO UPDATE SET is_enabled = true;

SELECT ok(NOT has_function_privilege('anon', 'public.complete_buyer_registration(uuid,text,boolean)', 'EXECUTE'), 'anonymous cannot complete setup');
SELECT ok(NOT has_function_privilege('authenticated', 'public.registration_account_state(uuid)', 'EXECUTE'), 'account state is not callable for another user');
SELECT ok(NOT has_table_privilege('authenticated', 'public.buyer_registrations', 'INSERT'), 'buyer entitlement is not browser-writable');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '289a0000-0000-4000-8000-000000000002', true);
SELECT is(public.get_my_registration_access()->>'registration_path', '/onboarding/buyer', 'buyer choice enters only free setup');
SELECT is(public.set_my_registration_intent('student'), false, 'OAuth choice cannot reclassify a returning buyer');
UPDATE public.profiles SET preferences = '{"registration_intent":"student","display_test":true}' WHERE id = auth.uid();
SELECT is((SELECT preferences->>'registration_intent' FROM public.profiles WHERE id = auth.uid()), 'buyer', 'profile edits cannot change registration choice');
SELECT is((SELECT preferences->>'display_test' FROM public.profiles WHERE id = auth.uid()), 'true', 'ordinary profile preferences can still be saved');
SELECT is(public.complete_buyer_registration('289a0000-0000-4000-8000-000000000001', '0240000000', false)->>'registration_fee', '0', 'buyer completes without a registration fee');
SELECT is(public.complete_buyer_registration('289a0000-0000-4000-8000-000000000001', '0240000000', true)->>'registration_type', 'buyer', 're-sending completed signup is idempotent');
SELECT is(public.get_my_registration_access()->>'status', 'free_buyer', 'buyer is active');
SELECT is(public.get_my_registration_access()->>'allowed', 'true', 'buyer can use the platform');
SELECT is(public.get_my_registration_access()->>'can_paystack', 'false', 'buyer cannot pay via Paystack');
SELECT is(public.can_upload_campus_community_media(), false, 'buyer cannot access a post-media upload');
SELECT is(public.ensure_my_student_referral_link()->>'eligible', 'false', 'buyer cannot generate a referral link');
SELECT throws_ok('SELECT public.get_my_referral_summary()', '42501', 'Eligible student referral access required', 'buyer cannot read a referral summary directly');
SELECT throws_ok($sql$SELECT public.create_vendor_registration_application('QA Shop', 'retail', 'Test only business',
  '123 test road', 'Accra', 'Greater Accra', 'Goods', '0240000000', NULL, 'external_vendor')$sql$,
  '42501', 'Complete your seller upgrade before registering a business', 'direct business signup cannot change a buyer role');
RESET ROLE;

SELECT is((SELECT count(*) FROM public.communication_events WHERE recipient_id = '289a0000-0000-4000-8000-000000000002'
  AND event_type = 'buyer_seller_upgrade_promotion'), 0::bigint, 'buyer without consent gets no upgrade email');
INSERT INTO public.orders(id, buyer_id, total_amount) VALUES
  ('289a0000-0000-4000-8000-000000000008', '289a0000-0000-4000-8000-000000000002', 25);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$SELECT public.create_marketplace_payment_intent('289a0000-0000-4000-8000-000000000008',
  'paystack', NULL, NULL, 'buyer-direct-paystack')$sql$, '42501',
  'Paystack is not available for this account or payment type', 'direct marketplace RPC cannot start Paystack for a buyer');
SELECT is(public.create_marketplace_payment_intent('289a0000-0000-4000-8000-000000000008',
  'manual', NULL, NULL, 'buyer-manual-receipt')->>'status', 'cash_on_delivery', 'buyer can still place a pay-on-receipt order');
SELECT throws_ok($sql$SELECT public.begin_student_registration_payment(
  '289a0000-0000-4000-8000-000000000001', '0240000000', NULL, NULL, NULL, NULL, '100', 2025, NULL, NULL, NULL, 'buyer-wrong-lane')$sql$,
  '42501', 'Paystack is not available for this account or payment type', 'direct registration RPC cannot charge a buyer');

SELECT is(public.start_my_student_seller_upgrade()->>'registration_path', '/onboarding/student', 'explicit upgrade opens student seller only');
SELECT is(public.get_my_registration_access()->>'status', 'free_buyer', 'upgrade keeps the free account active');
SELECT is(public.get_my_registration_access()->>'can_pay_student_registration', 'true', 'upgrade permits only its registration payment');
SELECT is(public.get_my_registration_access()->>'can_paystack', 'false', 'starting an upgrade does not enable marketplace Paystack');
SELECT is(public.begin_student_registration_payment(
  '289a0000-0000-4000-8000-000000000001', '0240000000', NULL, NULL, NULL, NULL, '100', 2025, NULL, NULL, NULL, 'buyer-to-seller-test')->>'amount',
  '10.00', 'an explicit buyer upgrade can create the GH₵10 student payment');
SELECT is(public.get_my_registration_access()->>'allowed', 'true', 'buyer still has platform access with a pending seller payment');
SELECT is((SELECT status FROM public.profiles WHERE id = auth.uid()), 'active', 'pending upgrade does not block existing interactions');
SELECT is(public.can_upload_campus_community_media(), false, 'pending upgrade still cannot publish');
SELECT is(public.ensure_my_student_referral_link()->>'eligible', 'false', 'pending upgrade still has no referral link');
RESET ROLE;

UPDATE public.payments SET provider_environment = 'test'
WHERE user_id = '289a0000-0000-4000-8000-000000000002' AND payment_type = 'student_registration';
UPDATE public.payments SET status = 'success' WHERE user_id = '289a0000-0000-4000-8000-000000000002'
  AND payment_type = 'student_registration';

SET LOCAL ROLE authenticated;
SELECT is(public.get_my_registration_access()->>'status', 'paid', 'verified payment completes seller upgrade');
SELECT is(public.get_my_registration_access()->>'buyer_restricted', 'false', 'paid seller is not stuck as a buyer');
SELECT is(public.get_my_registration_access()->>'can_paystack', 'true', 'paid seller can use app Paystack');
SELECT is(public.can_upload_campus_community_media(), true, 'paid student seller can publish');
SELECT is(public.ensure_my_student_referral_link()->>'eligible', 'true', 'paid seller can get a student referral');
SELECT is(public.get_my_registration_access()->>'student_business_covered', 'true', 'seller payment covers later student business setup');
RESET ROLE;

UPDATE public.student_profiles SET is_verified_student = true, verification_status = 'verified'
WHERE user_id = '289a0000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('unieco.test.student_vendor', public.create_vendor_registration_application('QA Student Shop', 'retail',
  'Student shop test registration', '123 test road', 'Accra', 'Greater Accra', 'Goods', '0240000000', NULL, 'student_vendor')->>'vendor_id', true);
SELECT is(public.confirm_student_seller_business_coverage(current_setting('unieco.test.student_vendor')::uuid), true,
  'verified student business setup uses the existing seller payment');
SELECT is(public.get_my_registration_access()->>'can_pay_vendor_registration', 'false', 'a second registration payment is not offered');
SELECT is(public.get_my_registration_access()->>'can_student_referral', 'true', 'student referral remains available after registering a student business');
RESET ROLE;
SELECT is((SELECT state FROM public.vendor_registration_payment_states WHERE vendor_id = current_setting('unieco.test.student_vendor')::uuid),
  'awaiting_verification', 'student business must still be approved before going live');
SELECT is((SELECT count(*) FROM public.payments WHERE vendor_id = current_setting('unieco.test.student_vendor')::uuid),
  0::bigint, 'student business coverage creates no second payment row');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '289a0000-0000-4000-8000-000000000003', true);
SELECT is(public.get_my_registration_access()->>'registration_path', '/onboarding/student', 'student seller signup enters the paid student path');
SELECT is(public.get_my_registration_access()->>'allowed', 'false', 'unpaid student seller does not have access');
SELECT is(public.get_my_registration_access()->>'can_vendor_referral', 'false', 'student seller cannot claim a business referral without a business payment');
SELECT is(public.can_upload_campus_community_media(), false, 'unpaid seller cannot publish');
SELECT throws_ok($sql$SELECT public.create_vendor_registration_application('QA Wrong Path', 'retail', 'Test wrong registration',
  '123 test road', 'Accra', 'Greater Accra', 'Goods', '0240000000', NULL, 'external_vendor')$sql$,
  '42501', 'Finish the registration selected for this account', 'student seller cannot bypass its registration with the business RPC');

SELECT set_config('request.jwt.claim.sub', '289a0000-0000-4000-8000-000000000005', true);
SELECT is(public.get_my_registration_access()->>'status', 'choice_required', 'plain Google sign-in does not default to paid registration');
SELECT is(public.set_my_registration_intent('buyer'), true, 'first signup choice can be saved');
SELECT is(public.get_my_registration_access()->>'registration_path', '/onboarding/buyer', 'saved first choice routes to buyer setup');

SELECT set_config('request.jwt.claim.sub', '289a0000-0000-4000-8000-000000000006', true);
SELECT is(public.complete_buyer_registration('289a0000-0000-4000-8000-000000000001', '0240000000', true)->>'registration_type',
  'buyer', 'buyer signup succeeds when email is requested');
RESET ROLE;
SELECT is((SELECT channels FROM public.communication_events WHERE recipient_id = '289a0000-0000-4000-8000-000000000006'
  AND event_type = 'buyer_seller_upgrade_promotion'), ARRAY['email'], 'optional seller upgrade promotion uses email only');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '289a0000-0000-4000-8000-000000000004', true);
SELECT is(public.get_my_registration_access()->>'registration_path', '/onboarding/vendor', 'standalone business signup has its own lane');
SELECT is(public.get_my_registration_access()->>'can_pay_student_registration', 'false', 'business is not sent to student payment');
SELECT throws_ok($sql$SELECT public.begin_student_registration_payment(
  '289a0000-0000-4000-8000-000000000001', '0240000000', NULL, NULL, NULL, NULL, '100', 2025, NULL, NULL, NULL, 'wrong-business-lane')$sql$,
  '42501', 'Paystack is not available for this account or payment type', 'standalone business cannot start student checkout directly');
SELECT set_config('unieco.test.business', public.create_vendor_registration_application('QA Independent Shop', 'retail',
  'Independent shop test registration', '123 test road', 'Accra', 'Greater Accra', 'Goods', '0240000000', NULL, 'external_vendor')->>'vendor_id', true);
SELECT is(public.get_my_registration_access()->>'allowed', 'false', 'business application alone does not grant access');
RESET ROLE;
SELECT to_regprocedure('public.set_my_vendor_location(uuid,numeric,numeric,text,text,text,text,text,text,text)') IS NOT NULL AS has_location \gset
\if :has_location
SET LOCAL ROLE authenticated;
SELECT lives_ok($sql$SELECT public.set_my_vendor_location(current_setting('unieco.test.business')::uuid,
  NULL,NULL,'123 test road','Accra','Greater Accra',NULL,'owner_address','business_location')$sql$,
  'standalone business can save a location before paying');
RESET ROLE;
\endif

-- Simulate an in-flight GH₵20 checkout from before the seller fee decreased.
INSERT INTO public.payments(id, user_id, vendor_id, entity_id, provider, payment_type, amount, status)
VALUES ('289a0000-0000-4000-8000-000000000009', '289a0000-0000-4000-8000-000000000004',
  current_setting('unieco.test.business')::uuid, current_setting('unieco.test.business')::uuid,
  'paystack', 'vendor_registration', 20, 'initiated');
UPDATE public.vendor_registration_payment_states SET state = 'payment_pending', payment_requirement = 'required',
  amount = 20, payment_id = '289a0000-0000-4000-8000-000000000009'
WHERE vendor_id = current_setting('unieco.test.business')::uuid;

SET LOCAL ROLE authenticated;
SELECT is(public.get_my_registration_access()->>'vendor_fee', '20.00', 'resumed checkout shows the amount saved for it');
SELECT is(public.get_my_registration_access()->>'allowed', 'false', 'pending business payment cannot unlock access');
RESET ROLE;
UPDATE public.payments SET status = 'success', amount = 19 WHERE id = '289a0000-0000-4000-8000-000000000009';
SET LOCAL ROLE authenticated;
SELECT is(public.get_my_registration_access()->>'allowed', 'false', 'wrong amount does not activate business access');
RESET ROLE;
UPDATE public.payments SET status = 'pending', amount = 20 WHERE id = '289a0000-0000-4000-8000-000000000009';
UPDATE public.payments SET status = 'success' WHERE id = '289a0000-0000-4000-8000-000000000009';
SET LOCAL ROLE authenticated;
SELECT is(public.get_my_registration_access()->>'allowed', 'true', 'verified GH₵20 snapshot is honored even after the fee becomes GH₵10');
SELECT is(public.get_my_registration_access()->>'can_vendor_referral', 'true', 'paid business gains its vendor referral eligibility');
SELECT is(public.can_upload_campus_community_media(), false, 'business publication still requires business verification');
RESET ROLE;

-- The older staging schema doesn't have the campus feed yet. Exercise the
-- actual publish and interaction RPCs when its migrations are installed.
SELECT to_regprocedure('public.create_campus_community_post_with_attachment(text,text,text,text,text,bigint)') IS NOT NULL AS has_community \gset
\if :has_community
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '289a0000-0000-4000-8000-000000000002', true);
SELECT set_config('unieco.test.seller_post', public.create_campus_community_post_with_attachment(
  'Test campus post', NULL, NULL, NULL, NULL, NULL)::text, true);
SELECT ok(current_setting('unieco.test.seller_post', true) IS NOT NULL, 'paid student seller can publish through the real feed RPC');
SELECT set_config('request.jwt.claim.sub', '289a0000-0000-4000-8000-000000000006', true);
SELECT throws_ok($sql$SELECT public.create_campus_community_post_with_attachment('Direct buyer post', NULL,NULL,NULL,NULL,NULL)$sql$,
  '42501', 'Complete UniEco verification before publishing campus posts', 'direct publish RPC rejects buyer');
SELECT throws_ok($sql$SELECT public.create_campus_community_post('Direct buyer photo', NULL, NULL)$sql$,
  '42501', 'Complete UniEco verification before publishing campus posts', 'legacy media post RPC rejects buyer');
SELECT is(public.set_campus_community_post_like(current_setting('unieco.test.seller_post')::uuid, true), true, 'buyer can still like a post');
SELECT is(public.set_campus_community_post_bookmark(current_setting('unieco.test.seller_post')::uuid, true), true, 'buyer can still save a post');
SELECT is(public.set_campus_community_follow('289a0000-0000-4000-8000-000000000002', true), true, 'buyer can still follow a seller');
RESET ROLE;
\endif

SELECT * FROM finish();
ROLLBACK;
