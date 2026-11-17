-- Use only on an isolated database; all fixtures and queued alerts roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT plan(12);

INSERT INTO public.user_roles(id,name) VALUES (2,'student') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('848a0000-0000-4000-8000-000000000061','message-one@example.test',now(),'{}'),
 ('848a0000-0000-4000-8000-000000000062','message-two@example.test',now(),'{}'),
 ('848a0000-0000-4000-8000-000000000063','message-three@example.test',now(),'{}');
UPDATE public.profiles SET status='active',is_active=true
 WHERE id IN ('848a0000-0000-4000-8000-000000000061','848a0000-0000-4000-8000-000000000062','848a0000-0000-4000-8000-000000000063');

INSERT INTO public.conversations(id,participant_one,participant_two) VALUES
 ('848a0000-0000-4000-8000-000000000064','848a0000-0000-4000-8000-000000000061','848a0000-0000-4000-8000-000000000062');
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('message-attachments','848a0000-0000-4000-8000-000000000064/848a0000-0000-4000-8000-000000000061/voice.webm','{"mimetype":"audio/webm"}'),
 ('message-attachments','848a0000-0000-4000-8000-000000000064/848a0000-0000-4000-8000-000000000061/photo.png','{"mimetype":"image/png"}');

SELECT ok((SELECT NOT public AND 'audio/webm'=ANY(allowed_mime_types) FROM storage.buckets WHERE id='message-attachments'),'Audio bucket stays private');
SELECT ok(NOT has_function_privilege('anon','public.send_direct_message(uuid,text,text,text)','EXECUTE'),'Anonymous cannot send');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '848a0000-0000-4000-8000-000000000063';
SELECT throws_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064','private'); $$,'42501','Conversation access denied','Outsider cannot send');
SELECT is((SELECT count(*) FROM storage.objects WHERE bucket_id='message-attachments'),0::bigint,'Outsider cannot read attachment records');
SET LOCAL "request.jwt.claim.sub" = '848a0000-0000-4000-8000-000000000061';
SELECT lives_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064','Secret test text'); $$,'Plain text still works');
SELECT lives_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064',NULL,'audio','attachment://848a0000-0000-4000-8000-000000000064/848a0000-0000-4000-8000-000000000061/voice.webm'); $$,'Own audio works');
SELECT throws_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064',NULL,'audio','attachment://848a0000-0000-4000-8000-000000000064/848a0000-0000-4000-8000-000000000061/photo.png'); $$,'22023','A supported voice attachment is required','Reject non-audio as a voice note');
SELECT lives_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064','{"latitude":5.5,"longitude":-0.2,"url":"https://www.google.com/maps/search/?api=1&query=5.5%2C-0.2"}','location'); $$,'Valid coordinates work');
SELECT throws_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064','{"latitude":95,"longitude":-0.2,"url":"https://www.google.com/maps/search/?api=1&query=95%2C-0.2"}','location'); $$,'22023','Invalid location share','Out of range rejected');
SELECT lives_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064','{"title":"UniEco business catalogue","url":"https://www.uniecoghana.com/business/test-shop"}','product'); $$,'UniEco catalogue works');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.notifications WHERE type='new_message'
 AND user_id='848a0000-0000-4000-8000-000000000062'
 AND body='Open UniEco to view your message.'
 AND action_url='/dashboard/messages?conversation=848a0000-0000-4000-8000-000000000064'),4::bigint,'Generated notifications have generic text and exact chat link');
INSERT INTO public.blocked_users(blocker_id,blocked_id) VALUES ('848a0000-0000-4000-8000-000000000062','848a0000-0000-4000-8000-000000000061');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT send_direct_message('848a0000-0000-4000-8000-000000000064','no'); $$,'42501','Messaging is not available for these users','Recipient block is enforced even in existing chat');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
