-- Executable tenant-isolation regression test.
-- Run only in an isolated local Supabase test database after applying all
-- local migrations (including drafts 0103 and 0104). All fixtures roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(29);

INSERT INTO public.universities(id, name, short_name, slug, is_enabled)
VALUES
  ('e1000000-0000-4000-8000-000000000001', 'Management Tenant Test A', 'MT-A', 'management-tenant-test-a', true),
  ('e1000000-0000-4000-8000-000000000002', 'Management Tenant Test B', 'MT-B', 'management-tenant-test-b', true);

-- The Supabase auth trigger creates student profiles. This test promotes only
-- the two scoped test accounts and assigns one active membership per tenant.
INSERT INTO auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('e2000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-admin-a@test.invalid', '', now(), '{}'::jsonb, '{"full_name":"Tenant Admin A"}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-admin-b@test.invalid', '', now(), '{}'::jsonb, '{"full_name":"Tenant Admin B"}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-student-a@test.invalid', '', now(), '{}'::jsonb, '{"full_name":"Tenant Student A"}'::jsonb, now(), now()),
  ('e2000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-student-b@test.invalid', '', now(), '{}'::jsonb, '{"full_name":"Tenant Student B"}'::jsonb, now(), now());

UPDATE public.profiles SET role_id = 7, university_id = 'e1000000-0000-4000-8000-000000000001'
WHERE id = 'e2000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role_id = 7, university_id = 'e1000000-0000-4000-8000-000000000002'
WHERE id = 'e2000000-0000-4000-8000-000000000002';
UPDATE public.profiles SET university_id = 'e1000000-0000-4000-8000-000000000001'
WHERE id = 'e2000000-0000-4000-8000-000000000003';
UPDATE public.profiles SET university_id = 'e1000000-0000-4000-8000-000000000002'
WHERE id = 'e2000000-0000-4000-8000-000000000004';

INSERT INTO public.university_admin_memberships(user_id, university_id, is_active)
VALUES
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', true),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', true);
INSERT INTO public.student_profiles(user_id, profile_id, university_id)
VALUES
  ('e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000002');
INSERT INTO public.vendors(id, university_id, owner_id, business_name, business_slug, is_active)
VALUES
  ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'Tenant Vendor A', 'tenant-vendor-a', true),
  ('e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000004', 'Tenant Vendor B', 'tenant-vendor-b', true);
INSERT INTO public.orders(id, university_id, buyer_id, vendor_id, status, total_amount, currency, order_number)
VALUES
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000001', 'pending', 10, 'GHS', 'TENANT-TEST-A'),
  ('e4000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000004', 'e3000000-0000-4000-8000-000000000002', 'pending', 20, 'GHS', 'TENANT-TEST-B');
INSERT INTO public.announcements(id, title, body, type, target_audience, university_id, created_by)
VALUES
  ('e5000000-0000-4000-8000-000000000001', 'Tenant Announcement A', 'Test body A', 'university', 'specific_university', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000002', 'Tenant Announcement B', 'Test body B', 'university', 'specific_university', 'e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2000000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role = 'authenticated';

SELECT is(public.current_app_role(), 'university_admin', 'University A fixture uses the database role');
SELECT is(public.can_manage_university('e1000000-0000-4000-8000-000000000001'), true, 'University A admin manages A');
SELECT is(public.can_manage_university('e1000000-0000-4000-8000-000000000002'), false, 'University A admin cannot manage B');
SELECT is((SELECT count(*)::integer FROM public.get_admin_universities()), 1, 'University A directory contains only A');
SELECT is((SELECT count(*)::integer FROM public.get_admin_universities() WHERE id = 'e1000000-0000-4000-8000-000000000002'), 0, 'University B is absent from A directory');
SELECT is((SELECT count(*)::integer FROM public.get_admin_student_directory()), 1, 'Student directory returns only A students');
SELECT is((SELECT count(*)::integer FROM public.get_admin_student_directory() WHERE university_id = 'e1000000-0000-4000-8000-000000000002'), 0, 'Student directory excludes B students');
SELECT is((SELECT count(*)::integer FROM public.get_admin_business_directory()), 1, 'Business directory returns only A vendors');
SELECT is((SELECT count(*)::integer FROM public.get_admin_business_directory() WHERE id = 'e3000000-0000-4000-8000-000000000002'), 0, 'Business directory excludes B vendors');
SELECT is((SELECT count(*)::integer FROM public.get_admin_business_directory() WHERE owner_email IS NOT NULL), 0, 'A vendor directory withholds owner email');
SELECT is((SELECT count(*)::integer FROM public.get_admin_order_monitoring()), 1, 'Order monitor returns only A orders');
SELECT is((SELECT count(*)::integer FROM public.get_admin_order_monitoring() WHERE university_id = 'e1000000-0000-4000-8000-000000000002'), 0, 'Order monitor excludes B orders');
SELECT is((SELECT count(*)::integer FROM public.get_admin_announcements()), 1, 'Announcement reader returns only A notices');
SELECT is((SELECT count(*)::integer FROM public.get_admin_announcements() WHERE university_id = 'e1000000-0000-4000-8000-000000000002'), 0, 'Announcement reader excludes B notices');
SELECT is(has_table_privilege('authenticated', 'public.announcements', 'INSERT'), false, 'Authenticated clients cannot directly insert announcements');
SELECT is(has_table_privilege('authenticated', 'public.announcements', 'UPDATE'), false, 'Authenticated clients cannot directly update announcements');
SELECT is(has_table_privilege('authenticated', 'public.announcements', 'DELETE'), false, 'Authenticated clients cannot directly delete announcements');
SELECT is(has_table_privilege('authenticated', 'public.universities', 'UPDATE'), false, 'Authenticated clients cannot directly update university records');
SELECT throws_ok(
  $$SELECT public.create_admin_announcement('Cross tenant', 'Forbidden', 'university', 'specific_university', 'e1000000-0000-4000-8000-000000000002', now(), now() + interval '1 day', 'test unauthorized cross university write')$$,
  '42501', 'University scope required', 'A cannot create an announcement for B');
SELECT throws_ok(
  $$SELECT public.create_admin_announcement('Platform notice', 'Forbidden', 'platform', 'all', NULL, now(), now() + interval '1 day', 'test unauthorized platform write')$$,
  '42501', 'Platform-wide announcements require super administrator authority and no university scope', 'A cannot create platform-wide announcements');
SELECT throws_ok(
  $$SELECT public.update_admin_announcement('e5000000-0000-4000-8000-000000000002', 'Changed', 'Forbidden', 'university', 'specific_university', 'e1000000-0000-4000-8000-000000000002', true, now(), now() + interval '1 day', 'test unauthorized cross university update')$$,
  '42501', 'Announcement is outside your university scope', 'A cannot edit B notices');
SELECT throws_ok(
  $$SELECT public.delete_admin_announcement('e5000000-0000-4000-8000-000000000002', 'test unauthorized cross university delete')$$,
  '42501', 'Announcement is outside your authorized scope', 'A cannot delete B notices');

SET LOCAL request.jwt.claim.sub = 'e2000000-0000-4000-8000-000000000002';
SELECT is(public.can_manage_university('e1000000-0000-4000-8000-000000000001'), false, 'University B admin cannot manage A');
SELECT is(public.can_manage_university('e1000000-0000-4000-8000-000000000002'), true, 'University B admin manages B');
SELECT is((SELECT count(*)::integer FROM public.get_admin_universities() WHERE id = 'e1000000-0000-4000-8000-000000000001'), 0, 'University A is absent from B directory');
SELECT is((SELECT count(*)::integer FROM public.get_admin_student_directory() WHERE university_id = 'e1000000-0000-4000-8000-000000000001'), 0, 'B student directory excludes A students');
SELECT is((SELECT count(*)::integer FROM public.get_admin_business_directory() WHERE id = 'e3000000-0000-4000-8000-000000000001'), 0, 'B business directory excludes A vendors');
SELECT is((SELECT count(*)::integer FROM public.get_admin_order_monitoring() WHERE university_id = 'e1000000-0000-4000-8000-000000000001'), 0, 'B order monitor excludes A orders');
SELECT is((SELECT count(*)::integer FROM public.get_admin_announcements() WHERE university_id = 'e1000000-0000-4000-8000-000000000001'), 0, 'B announcement reader excludes A notices');

SELECT * FROM finish();
ROLLBACK;
