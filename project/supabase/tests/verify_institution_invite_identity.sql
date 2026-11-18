-- Disposable database only. Both users and all role changes roll back.
BEGIN;

INSERT INTO public.user_roles(id, name) VALUES (2, 'student'), (7, 'university_admin')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.universities(id, name, short_name, official_name, slug, is_enabled)
VALUES ('21100000-0000-4000-8000-000000000001', 'QA Invite College', 'QAIC', 'QA Invite College', 'qa-invite-college', true);
INSERT INTO auth.users(id, email, email_confirmed_at, raw_user_meta_data)
VALUES
  ('21100000-0000-4000-8000-000000000002', 'qa-inviter@example.test', now(), '{}'),
  ('21100000-0000-4000-8000-000000000003', 'qa-former@example.test', now(), '{}'),
  ('21100000-0000-4000-8000-000000000004', 'qa-unverified@example.test', null, '{}'),
  ('21100000-0000-4000-8000-000000000005', 'qa-new@example.test', now(), '{}');
INSERT INTO public.institution_admin_invitations(token_hash, recipient_email, university_id, invited_by, expires_at)
VALUES
  (encode(extensions.digest('UAI_' || repeat('a', 64), 'sha256'), 'hex'), 'qa-former@example.test',
   '21100000-0000-4000-8000-000000000001', '21100000-0000-4000-8000-000000000002', now() + interval '2 days'),
  (encode(extensions.digest('UAI_' || repeat('b', 64), 'sha256'), 'hex'), 'qa-unverified@example.test',
   '21100000-0000-4000-8000-000000000001', '21100000-0000-4000-8000-000000000002', now() + interval '2 days');
-- Match a real email change: the profile may still hold the previous address.
UPDATE auth.users SET email = 'qa-changed@example.test' WHERE id = '21100000-0000-4000-8000-000000000003';
UPDATE auth.users SET email = 'qa-former@example.test' WHERE id = '21100000-0000-4000-8000-000000000005';

SET LOCAL ROLE anon;
DO $$
DECLARE data jsonb := public.get_institution_admin_invite('UAI_' || repeat('a', 64));
BEGIN
  IF (data->>'valid')::boolean IS NOT TRUE OR data ? 'recipient_email' THEN
    RAISE EXCEPTION 'Invite preview must remain available without revealing the recipient mailbox';
  END IF;
  IF has_function_privilege(current_user, 'public.accept_institution_admin_invite(text)', 'execute') THEN
    RAISE EXCEPTION 'Anonymous invite acceptance must be denied';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '21100000-0000-4000-8000-000000000003', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_institution_admin_invite('UAI_' || repeat('a', 64));
    RAISE EXCEPTION 'An email held only in the profile must not grant a staff role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '21100000-0000-4000-8000-000000000004', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_institution_admin_invite('UAI_' || repeat('b', 64));
    RAISE EXCEPTION 'Unverified email must not grant a staff role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '21100000-0000-4000-8000-000000000005', true);
DO $$
BEGIN
  IF (public.accept_institution_admin_invite('UAI_' || repeat('a', 64))->>'accepted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Verified invited account should be able to accept';
  END IF;
  BEGIN
    PERFORM public.accept_institution_admin_invite('UAI_' || repeat('a', 64));
    RAISE EXCEPTION 'An accepted invitation must not be reusable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;
