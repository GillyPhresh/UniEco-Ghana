-- Local/isolated DB only. Synthetic contacts; all fixture writes roll back.
BEGIN;
INSERT INTO public.user_roles(id,name) VALUES (2,'student'),(4,'external_vendor'),(6,'super_admin') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('02120000-0000-4000-8000-000000000001','admin@fixture.invalid','{}'),
 ('02120000-0000-4000-8000-000000000002','seller@fixture.invalid','{"registration_intent":"student"}'),
 ('02120000-0000-4000-8000-000000000003','vendor@fixture.invalid','{"registration_intent":"external_vendor"}'),
 ('02120000-0000-4000-8000-000000000004','buyer@fixture.invalid','{"registration_intent":"buyer"}');
UPDATE public.profiles SET role_id=(SELECT id FROM public.user_roles WHERE name='super_admin'),status='active'
 WHERE id='02120000-0000-4000-8000-000000000001';
UPDATE public.profiles SET created_at=now()-interval '31 minutes'
 WHERE id IN ('02120000-0000-4000-8000-000000000002','02120000-0000-4000-8000-000000000003','02120000-0000-4000-8000-000000000004');
INSERT INTO public.vendors(owner_id,business_name,business_slug,contact_phone,contact_email)
 VALUES('02120000-0000-4000-8000-000000000003','Fixture business','fixture-followup-0212','0240000012','saved@fixture.invalid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','02120000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 BEGIN PERFORM public.registration_contact_page('pending'); RAISE EXCEPTION 'student read contacts';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.registration_contact_steps; RAISE EXCEPTION 'table exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_my_registration_contact_step('external_vendor','0240000001'); RAISE EXCEPTION 'wrong lane accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_my_registration_contact_step('student','bad'); RAISE EXCEPTION 'bad phone accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.save_my_registration_contact_step('student','0240000001');
 PERFORM public.save_my_registration_contact_step('student','0240000002');
END $$;
SELECT set_config('request.jwt.claim.sub','02120000-0000-4000-8000-000000000001',true);
DO $$ DECLARE a record; b record; BEGIN
 SELECT * INTO STRICT a FROM public.registration_contact_page('pending') WHERE id='02120000-0000-4000-8000-000000000002';
 IF a.phone IS DISTINCT FROM '0240000002' OR a.email IS DISTINCT FROM 'seller@fixture.invalid' OR a.email_confirmed THEN
   RAISE EXCEPTION 'early seller contact or unconfirmed status missing'; END IF;
 SELECT * INTO STRICT b FROM public.registration_contact_page('pending') WHERE id='02120000-0000-4000-8000-000000000003';
 IF b.business_phone IS DISTINCT FROM '0240000012' OR b.business_email IS DISTINCT FROM 'saved@fixture.invalid'
 OR b.phone IS NOT NULL THEN RAISE EXCEPTION 'existing vendor contacts missing or mislabeled'; END IF;
 IF EXISTS (SELECT 1 FROM public.registration_contact_page('pending',b.created_at,b.id) WHERE id=b.id)
 OR NOT EXISTS (SELECT 1 FROM public.registration_contact_page('pending',b.created_at,b.id) WHERE id=a.id) THEN
 RAISE EXCEPTION 'pagination failed on timestamp tie'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','02120000-0000-4000-8000-000000000003',true);
SELECT public.save_my_registration_contact_step('external_vendor','0240000003','step@fixture.invalid');
RESET ROLE;
INSERT INTO public.universities(id,name,short_name,official_name,slug,is_enabled) VALUES
 ('02120000-0000-4000-8000-000000000005','Contact Fixture College','Fixture','Contact Fixture College','contact-fixture-0212',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','02120000-0000-4000-8000-000000000004',true);
SELECT public.complete_buyer_registration('02120000-0000-4000-8000-000000000005','0240000004',false);
SELECT set_config('request.jwt.claim.sub','02120000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.registration_contact_page('pending') WHERE id IN
 ('02120000-0000-4000-8000-000000000004','02120000-0000-4000-8000-000000000001')) THEN
 RAISE EXCEPTION 'completed buyer or staff in pending'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.registration_contact_page('pending') WHERE id='02120000-0000-4000-8000-000000000003'
 AND business_email='step@fixture.invalid' AND business_phone='0240000003') THEN RAISE EXCEPTION 'explicit vendor step missing'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','02120000-0000-4000-8000-000000000099',true);
DO $$ BEGIN
 BEGIN PERFORM public.registration_contact_page('pending'); RAISE EXCEPTION 'missing role read contacts';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_admin_registration_followups(); RAISE EXCEPTION 'missing role read legacy contacts';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.registration_contact_page(text,timestamptz,uuid,integer)','EXECUTE') THEN
 RAISE EXCEPTION 'anonymous RPC exposed'; END IF;
END $$;
ROLLBACK;
