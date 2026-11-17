-- Only on an isolated local copy. All fixture data and transitions roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions,pg_catalog;
SELECT no_plan();

INSERT INTO public.user_roles(id,name) VALUES (2,'student'),(4,'external_vendor'),(6,'super_admin') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('848a0000-0000-4000-8000-000000000001','courier-admin@example.test',now(),'{}'),
 ('848a0000-0000-4000-8000-000000000002','courier-buyer@example.test',now(),'{"registration_intent":"buyer"}'),
 ('848a0000-0000-4000-8000-000000000003','courier-shop@example.test',now(),'{}'),
 ('848a0000-0000-4000-8000-000000000004','courier-one@example.test',now(),'{"signup_experience":"courier"}'),
 ('848a0000-0000-4000-8000-000000000005','courier-two@example.test',now(),'{}'),
 ('848a0000-0000-4000-8000-000000000006','unconfirmed@example.test',NULL,'{"signup_experience":"courier"}'),
 ('848a0000-0000-4000-8000-000000000007','other-campus@example.test',now(),'{}');
UPDATE public.profiles SET role_id=(SELECT id FROM public.user_roles WHERE name='super_admin'), status='active'
 WHERE id='848a0000-0000-4000-8000-000000000001';
INSERT INTO public.universities(id,name,short_name,official_name,slug,is_enabled) VALUES
 ('848a0000-0000-4000-8000-000000000010','Courier QA Campus','QA','Courier QA Campus','courier-qa-campus',true),
 ('848a0000-0000-4000-8000-000000000011','Other QA Campus','Other QA','Other QA Campus','courier-qa-other',true);
INSERT INTO public.vendors(id,owner_id,university_id,business_name,business_slug,is_verified,is_active,delivery_available,contact_phone)
 VALUES('848a0000-0000-4000-8000-000000000012','848a0000-0000-4000-8000-000000000003','848a0000-0000-4000-8000-000000000010',
 'QA Parcel Shop','qa-parcel-shop',true,true,true,'+233241000111');
INSERT INTO public.orders(id,buyer_id,vendor_id,university_id,status,order_type,delivery_method,delivery_address,delivery_fee,total_amount,currency,order_number)
 VALUES
 ('848a0000-0000-4000-8000-000000000020','848a0000-0000-4000-8000-000000000002','848a0000-0000-4000-8000-000000000012',
 '848a0000-0000-4000-8000-000000000010','processing','product','delivery','{"line1":"QA private drop-off","city":"Accra","region":"Greater Accra","landmark":"QA door","instructions":"do not expose this"}',10,50,'GHS','QA-DELIVERY-0205'),
 ('848a0000-0000-4000-8000-000000000021','848a0000-0000-4000-8000-000000000002','848a0000-0000-4000-8000-000000000012',
 '848a0000-0000-4000-8000-000000000010','processing','product','pickup',NULL,0,19,'GHS','QA-PICKUP-0205'),
 -- Staff are Paystack-eligible; the ordinary buyer above uses manual payment.
 ('848a0000-0000-4000-8000-000000000022','848a0000-0000-4000-8000-000000000001','848a0000-0000-4000-8000-000000000012',
 '848a0000-0000-4000-8000-000000000010','confirmed','product','delivery','{"line1":"QA prepaid drop-off","city":"Accra"}',10,70,'GHS','QA-PREPAID-0205');
INSERT INTO public.payments(order_id,user_id,vendor_id,provider,payment_type,entity_id,amount,currency,status,payment_reference)
 VALUES
 ('848a0000-0000-4000-8000-000000000020','848a0000-0000-4000-8000-000000000002','848a0000-0000-4000-8000-000000000012',
 'manual','marketplace','848a0000-0000-4000-8000-000000000020',50,'GHS','cash_on_delivery','QA-COURIER-MANUAL'),
 ('848a0000-0000-4000-8000-000000000022','848a0000-0000-4000-8000-000000000001','848a0000-0000-4000-8000-000000000012',
 'paystack','marketplace','848a0000-0000-4000-8000-000000000022',70,'GHS','success','QA-COURIER-PREPAID');

SET LOCAL ROLE anon;
SELECT is(public.courier_program_is_open(),false,'programme defaults to closed');
SELECT ok(NOT has_table_privilege('anon','public.courier_jobs','SELECT'),'anonymous cannot read jobs');
SELECT ok(NOT has_function_privilege('anon','public.courier_workspace()','EXECUTE'),'workspace requires an account');
RESET ROLE;
SELECT ok(NOT has_table_privilege('authenticated','public.courier_jobs','SELECT,INSERT,UPDATE,DELETE'),'authenticated uses projections, not full jobs');
SELECT ok(NOT has_table_privilege('authenticated','public.courier_applications','SELECT,INSERT,UPDATE'),'applications and phone numbers are private');
SELECT ok(NOT has_function_privilege('authenticated','public.courier_can_work(uuid)','EXECUTE'),'membership helper cannot probe other accounts');
SELECT ok(NOT has_function_privilege('authenticated','public.courier_without_paid_intent(uuid)','EXECUTE'),'reminder helper cannot probe other users');
WITH inserted AS (
  INSERT INTO public.communication_campaign_log(user_id,campaign_key,period_start)
  VALUES('848a0000-0000-4000-8000-000000000004','registration_payment_required',now()) RETURNING id
) SELECT is((SELECT count(*) FROM inserted),0::bigint,'courier signup cannot be selected for paid campaign');
WITH inserted AS (
  INSERT INTO public.notifications(user_id,type,title,body)
  VALUES('848a0000-0000-4000-8000-000000000004','registration_payment_required','Test payment','Fixture only') RETURNING id
) SELECT is((SELECT count(*) FROM inserted),0::bigint,'old in-app payment prompts skip courier-only accounts');
SELECT is(public.enqueue_trusted_communication_event('registration_payment_required','848a0000-0000-4000-8000-000000000004',
  NULL,NULL,'Test payment',ARRAY['email','push']),NULL::uuid,'old push and email payment prompts skip courier-only accounts');
SELECT ok(public.enqueue_trusted_communication_event('order_placed','848a0000-0000-4000-8000-000000000004',
  NULL,NULL,'Test order',ARRAY['in_app']) IS NOT NULL,'other event types keep normal communication behavior');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000004',true);
SELECT throws_ok($$SELECT public.courier_apply('848a0000-0000-4000-8000-000000000010','QA rider','+233241000112','motorbike',true)$$,
 '55000','Courier applications are closed','applicants cannot bypass the closed start');
SELECT throws_ok($$SELECT public.courier_admin_set_program(true,true)$$,'42501','Courier operations access required','courier cannot open the programme');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.courier_admin_set_program(true,false)$$,'22023','Confirm the operator, safety and compensation arrangements first','staff must acknowledge operational readiness');
SELECT lives_ok($$SELECT public.courier_admin_set_program(true,true)$$,'authorized staff can open the local test programme');
SELECT is(public.courier_program_is_open(),true,'public availability reports just the switch');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000006',true);
SELECT throws_ok($$SELECT public.courier_apply('848a0000-0000-4000-8000-000000000010','QA unconfirmed','+233241000116','walking',true)$$,
 '42501','Confirm your email before applying','unconfirmed signups cannot apply');

SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000004',true);
SELECT lives_ok($$SELECT public.courier_apply('848a0000-0000-4000-8000-000000000010','QA rider','+233241000112','motorbike',true)$$,'confirmed courier can apply without paying a student fee');
SELECT is(public.courier_workspace()#>>'{application,status}','pending','new application needs approval');
SELECT is(public.courier_workspace()->>'can_work','false','pending application grants no courier authority');
SELECT throws_ok($$SELECT public.courier_claim_job('848a0000-0000-4000-8000-000000000020',800)$$,
 '42501','Only approved couriers may accept delivery offers','pending applicant cannot claim');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000005',true);
SELECT lives_ok($$SELECT public.courier_apply('848a0000-0000-4000-8000-000000000010','QA backup','+233241000113','bicycle',true)$$,'bicycle application is accepted');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000007',true);
SELECT lives_ok($$SELECT public.courier_apply('848a0000-0000-4000-8000-000000000011','QA elsewhere','+233241000117','car',true)$$,'licensed car and taxi use the car lane');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.courier_admin_review('848a0000-0000-4000-8000-000000000004','approved',NULL,true)$$,
 '22023','Verify the applicant and all applicable documents before approving','motorbike approval requires licence expiry');
SELECT lives_ok($$SELECT public.courier_admin_review('848a0000-0000-4000-8000-000000000004','approved',current_date+30,true)$$,'staff approves a checked motorbike rider');
SELECT lives_ok($$SELECT public.courier_admin_review('848a0000-0000-4000-8000-000000000005','approved',NULL,true)$$,'staff approves a checked bicycle courier');
SELECT lives_ok($$SELECT public.courier_admin_review('848a0000-0000-4000-8000-000000000007','approved',current_date+30,true)$$,'staff approves checked car courier');
SELECT is(jsonb_array_length(public.courier_admin_dashboard()->'applications'),3,'admin can read private application queue');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$SELECT public.courier_request_for_order('848a0000-0000-4000-8000-000000000020','QA private pickup','small',true)$$,
 '22023','This delivery is not eligible for a courier request','no dispatch without buyer authorization');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.courier_authorize_for_order('848a0000-0000-4000-8000-000000000021',true)$$,
 '42501','Courier choice is not available on this order','pickup orders cannot be converted behind checkout');
SELECT lives_ok($$SELECT public.courier_authorize_for_order('848a0000-0000-4000-8000-000000000020',true)$$,'buyer opts in per order');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$SELECT public.courier_authorize_for_order('848a0000-0000-4000-8000-000000000022',true)$$,'prepaid buyer can opt in');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000003',true);
SELECT lives_ok($$SELECT public.courier_request_for_order('848a0000-0000-4000-8000-000000000020','QA private pickup','small',true)$$,'shop requests help after acknowledging direct pay on receipt');
SELECT lives_ok($$SELECT public.courier_request_for_order('848a0000-0000-4000-8000-000000000022','QA prepaid pickup','large',true)$$,'verified prepaid order can start a parcel request');
SELECT lives_ok($$SELECT public.courier_shop_withdraw('848a0000-0000-4000-8000-000000000022')$$,'shop can withdraw an unassigned courier request');
SELECT is(public.courier_order_tracking('848a0000-0000-4000-8000-000000000020')->>'state','requested','shop can track its own request');
SELECT throws_ok($$SELECT public.vendor_transition_order('848a0000-0000-4000-8000-000000000020','out_for_delivery',NULL)$$,
 '55000','Use the assigned courier handoff or cancel the courier request first','shop cannot bypass an accepted courier request');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT public.courier_admin_dispatch('848a0000-0000-4000-8000-000000000020','publish',1100)$$,
 '22023','This offer is unavailable or the fee exceeds the order’s delivery budget','offer cannot exceed the existing delivery fee');
SELECT lives_ok($$SELECT public.courier_admin_dispatch('848a0000-0000-4000-8000-000000000020','publish',800)$$,'staff publishes explicit GH8 courier terms');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000007',true);
SELECT lives_ok('SELECT public.courier_set_available(true)','other campus courier can go available');
SELECT is(jsonb_array_length(public.courier_workspace()->'offers'),0,'other-campus offer not visible');
SELECT throws_ok($$SELECT public.courier_claim_job('848a0000-0000-4000-8000-000000000020',800)$$,
 '55000','This delivery is no longer available to you','other campus cannot claim by UUID');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000005',true);
SELECT lives_ok('SELECT public.courier_set_available(true)','backup courier goes available');
SELECT throws_ok($$SELECT public.courier_claim_job('848a0000-0000-4000-8000-000000000020',500)$$,
 '55000','The delivery fee changed. Review the updated offer before accepting','couriers cannot accept unseen fee terms');
SELECT lives_ok($$SELECT public.courier_claim_job('848a0000-0000-4000-8000-000000000020',800)$$,'backup courier accepts the actual offer');
SELECT lives_ok($$SELECT public.courier_release_job('848a0000-0000-4000-8000-000000000020')$$,'backup courier can release before-collection');
SELECT is(public.courier_workspace()->>'assignment',NULL,'releasing clears the private assignment');
SELECT is(public.courier_workspace()#>>'{application,available}','false','releasing takes the courier offline');
SELECT lives_ok('SELECT public.courier_set_available(true)','courier can go back online');
SELECT throws_ok($$SELECT public.courier_claim_job('848a0000-0000-4000-8000-000000000020',800)$$,
 '55000','Wait two minutes after releasing a delivery before claiming another','repeated claim and release is rate limited');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000004',true);
SELECT lives_ok('SELECT public.courier_set_available(true)','approved courier goes available');
SELECT is(jsonb_array_length(public.courier_workspace()->'offers'),1,'matching courier sees offer');
SELECT ok(public.courier_workspace()::text NOT LIKE '%QA private%', 'unclaimed offers show neither address');
SELECT is(public.courier_workspace()#>>'{offers,0,fee_pesewas}','800','courier sees the exact fee before claiming');
SELECT lives_ok($$SELECT public.courier_claim_job('848a0000-0000-4000-8000-000000000020',800)$$,'another eligible courier can claim the released delivery');
SELECT is(public.courier_workspace()#>>'{assignment,pickup}','QA private pickup','assigned courier receives pickup address only');
SELECT is(public.courier_workspace()#>>'{assignment,dropoff}',NULL,'drop-off not shared before pickup');
SELECT throws_ok($$SELECT public.courier_order_tracking('848a0000-0000-4000-8000-000000000020')$$,
 '42501','Order access denied','courier cannot read either party’s handoff codes');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000005',true);
SELECT lives_ok('SELECT public.courier_set_available(true)','second driver can be available');
SELECT throws_ok($$SELECT public.courier_claim_job('848a0000-0000-4000-8000-000000000020',800)$$,
 '55000','This delivery is no longer available to you','a job cannot be accepted twice');
SELECT is(public.courier_workspace()#>>'{assignment,pickup}',NULL,'unassigned driver never sees pickup');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000002',true);
SELECT is(public.courier_order_tracking('848a0000-0000-4000-8000-000000000020')->>'handoff_code',NULL,'buyer cannot get the pickup code');
SELECT throws_ok($$SELECT public.courier_authorize_for_order('848a0000-0000-4000-8000-000000000020',false)$$,
 '55000','An assigned delivery must be changed through support','one party cannot strand a courier');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000003',true);
SELECT ok(length(set_config('courier.test.pickup',public.courier_order_tracking('848a0000-0000-4000-8000-000000000020')->>'handoff_code',true))=6,'only shop gets pickup code');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$SELECT public.courier_admin_set_program(false,false)$$,'staff can pause new work without disrupting an accepted job');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000004',true);
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020','9999999')->>'reason','code','bad PIN fails without completing pickup');
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020','9999999')->>'reason','code','second failure is counted');
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020','9999999')->>'reason','code','third failure is counted');
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020','9999999')->>'reason','code','fourth failure is counted');
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020','9999999')->>'reason','wait','fifth failure imposes a cooldown');
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020',current_setting('courier.test.pickup'))->>'reason','wait','correct PIN cannot bypass cooldown');
RESET ROLE;
UPDATE public.courier_jobs SET retry_after=now()-interval '1 minute' WHERE order_id='848a0000-0000-4000-8000-000000000020';
SET LOCAL ROLE authenticated;
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020',current_setting('courier.test.pickup'))->>'state','collected','assigned courier collects using verified PIN during a pause');
SELECT throws_ok($$SELECT public.courier_release_job('848a0000-0000-4000-8000-000000000020')$$,
 '55000','Only a job you have not collected can be released','courier cannot release a parcel already collected');
SELECT is(public.courier_workspace()#>>'{assignment,dropoff,line1}','QA private drop-off','drop-off disclosed only after pickup');
SELECT ok(public.courier_workspace()::text NOT LIKE '%do not expose this%','private free-form order notes are withheld');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT public.customer_confirm_order_handoff('848a0000-0000-4000-8000-000000000020',NULL)$$,
 '55000','Confirm receipt after the courier drop-off','old confirm action cannot complete before genuine drop-off');
SELECT ok(length(set_config('courier.test.dropoff',public.courier_order_tracking('848a0000-0000-4000-8000-000000000020')->>'handoff_code',true))=6,'buyer gets drop-off code in transit');
SELECT isnt(current_setting('courier.test.dropoff'),current_setting('courier.test.pickup'),'pickup and drop-off codes are distinct');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000004',true);
SELECT is(public.courier_record_handoff('848a0000-0000-4000-8000-000000000020',current_setting('courier.test.dropoff'))->>'state','delivered','assigned courier completes parcel handoff');
SELECT is(public.courier_workspace()->>'assignment',NULL,'delivery address no longer returned after drop-off');
SELECT set_config('request.jwt.claim.sub','848a0000-0000-4000-8000-000000000002',true);
SELECT is(public.courier_order_tracking('848a0000-0000-4000-8000-000000000020')->>'contact',NULL,'driver phone not returned after delivery');
SELECT is(public.customer_confirm_order_handoff('848a0000-0000-4000-8000-000000000020',NULL),true,'buyer still owns final receipt confirmation');
RESET ROLE;
SELECT is((SELECT status FROM public.payments WHERE payment_reference='QA-COURIER-MANUAL'),'cash_on_delivery','courier never marks a payment collected');
SELECT is((SELECT count(*) FROM public.payments WHERE order_id='848a0000-0000-4000-8000-000000000020'),1::bigint,'no payment or payout is created by courier activity');
SELECT is((SELECT pickup_address FROM public.courier_jobs WHERE order_id='848a0000-0000-4000-8000-000000000020'),NULL,'duplicate private pickup is purged on completion');
UPDATE public.profiles SET preferences=jsonb_build_object('registration_intent','student') WHERE id='848a0000-0000-4000-8000-000000000004';
SELECT ok(NOT public.courier_without_paid_intent('848a0000-0000-4000-8000-000000000004'),'explicit seller registration keeps its existing payment lane');
SELECT * FROM finish();
ROLLBACK;
