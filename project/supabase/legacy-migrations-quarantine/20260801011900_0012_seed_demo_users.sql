/*
# Seed demo auth users and profiles for vendor owners + reviewers

Creates 20 demo auth users (10 vendor owners + 10 reviewers) and their
profiles. These are needed for the vendor and review seed data.
*/

-- Auth users: 10 vendor owners (001-010) + 10 reviewers (011-020)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at, email_change_confirm_status)
SELECT u.uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, crypt('DemoPassword123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.name, 'role', 'external_vendor'), now(), now(), now(), 0
FROM (VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'campusbites@uenr.edu.gh', 'Campus Bites Owner'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'printrib@uenr.edu.gh', 'Print Hub Owner'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'techpoint@uenr.edu.gh', 'TechPoint Owner'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'serwaastyles@gmail.com', 'Serwaa Styles Owner'),
  ('00000000-0000-0000-0000-000000000005'::uuid, 'beautylounge@gmail.com', 'Beauty Lounge Owner'),
  ('00000000-0000-0000-0000-000000000006'::uuid, 'campusride@gmail.com', 'Campus Ride Owner'),
  ('00000000-0000-0000-0000-000000000007'::uuid, 'kwameshoots@gmail.com', 'Kwame Photography Owner'),
  ('00000000-0000-0000-0000-000000000008'::uuid, 'bookstore@uenr.edu.gh', 'UENR Bookstore Owner'),
  ('00000000-0000-0000-0000-000000000009'::uuid, 'greenbowl@gmail.com', 'Green Bowl Owner'),
  ('00000000-0000-0000-0000-000000000010'::uuid, 'fixitrepairs@gmail.com', 'FixIt Repairs Owner'),
  ('00000000-0000-0000-0000-000000000011'::uuid, 'reviewer1@uenr.edu.gh', 'Ama Serwaa'),
  ('00000000-0000-0000-0000-000000000012'::uuid, 'reviewer2@uenr.edu.gh', 'Kwame Mensah'),
  ('00000000-0000-0000-0000-000000000013'::uuid, 'reviewer3@uenr.edu.gh', 'Akosua Darko'),
  ('00000000-0000-0000-0000-000000000014'::uuid, 'reviewer4@uenr.edu.gh', 'Yaw Owusu'),
  ('00000000-0000-0000-0000-000000000015'::uuid, 'reviewer5@uenr.edu.gh', 'Efua Boateng'),
  ('00000000-0000-0000-0000-000000000016'::uuid, 'reviewer6@uenr.edu.gh', 'Kofi Asante'),
  ('00000000-0000-0000-0000-000000000017'::uuid, 'reviewer7@uenr.edu.gh', 'Adwoa Frimpong'),
  ('00000000-0000-0000-0000-000000000018'::uuid, 'reviewer8@uenr.edu.gh', 'Kojo Adjei'),
  ('00000000-0000-0000-0000-000000000019'::uuid, 'reviewer9@uenr.edu.gh', 'Ama Pokuaa'),
  ('00000000-0000-0000-0000-000000000020'::uuid, 'reviewer10@uenr.edu.gh', 'Nana Yaw')
) AS u(uid, email, name)
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE id = u.uid);

-- Profiles: 10 vendor owners + 10 reviewers
INSERT INTO profiles (id, email, full_name, role_id, is_active, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'campusbites@uenr.edu.gh', 'Campus Bites Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000002', 'printrib@uenr.edu.gh', 'Print Hub Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000003', 'techpoint@uenr.edu.gh', 'TechPoint Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000004', 'serwaastyles@gmail.com', 'Serwaa Styles Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000005', 'beautylounge@gmail.com', 'Beauty Lounge Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000006', 'campusride@gmail.com', 'Campus Ride Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000007', 'kwameshoots@gmail.com', 'Kwame Photography Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000008', 'bookstore@uenr.edu.gh', 'UENR Bookstore Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000009', 'greenbowl@gmail.com', 'Green Bowl Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000010', 'fixitrepairs@gmail.com', 'FixIt Repairs Owner', 4, true, 'active'),
  ('00000000-0000-0000-0000-000000000011', 'reviewer1@uenr.edu.gh', 'Ama Serwaa', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000012', 'reviewer2@uenr.edu.gh', 'Kwame Mensah', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000013', 'reviewer3@uenr.edu.gh', 'Akosua Darko', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000014', 'reviewer4@uenr.edu.gh', 'Yaw Owusu', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000015', 'reviewer5@uenr.edu.gh', 'Efua Boateng', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000016', 'reviewer6@uenr.edu.gh', 'Kofi Asante', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000017', 'reviewer7@uenr.edu.gh', 'Adwoa Frimpong', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000018', 'reviewer8@uenr.edu.gh', 'Kojo Adjei', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000019', 'reviewer9@uenr.edu.gh', 'Ama Pokuaa', 2, true, 'active'),
  ('00000000-0000-0000-0000-000000000020', 'reviewer10@uenr.edu.gh', 'Nana Yaw', 2, true, 'active')
ON CONFLICT (id) DO NOTHING;