-- Secure, email-bound invitations for institution platform administrators.
-- The recipient must create/sign in to an account before the scoped role is
-- granted; clicking a link alone never grants privileged access.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  note text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_email = lower(btrim(recipient_email))),
  CHECK (expires_at > created_at),
  CHECK ((accepted_at IS NULL AND accepted_by IS NULL) OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS institution_admin_invites_active_idx
  ON public.institution_admin_invitations (recipient_email, expires_at)
  WHERE accepted_at IS NULL;
ALTER TABLE public.institution_admin_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.institution_admin_invitations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_institution_admin_invite(
  p_university_id uuid,
  p_recipient_email text,
  p_expires_hours integer DEFAULT 168,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  uid uuid := auth.uid();
  email_value text := lower(btrim(p_recipient_email));
  token text := 'UAI_' || encode(extensions.gen_random_bytes(32), 'hex');
  invite_id uuid;
  expires_value timestamptz;
  institution_name text;
  invite_url text;
BEGIN
  IF uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_university_id IS NULL THEN
    RAISE EXCEPTION 'An institution is required' USING ERRCODE = '22023';
  END IF;
  IF email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid recipient email is required' USING ERRCODE = '22023';
  END IF;
  IF p_expires_hours IS NULL OR p_expires_hours NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'Invitation expiry must be between 1 and 720 hours' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO institution_name FROM public.universities WHERE id = p_university_id AND is_enabled;
  IF institution_name IS NULL THEN
    RAISE EXCEPTION 'The institution does not exist or is disabled' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles role ON role.id = profile.role_id
    WHERE lower(profile.email) = email_value AND role.name = 'university_admin'
      AND EXISTS (SELECT 1 FROM public.university_admin_memberships m WHERE m.user_id = profile.id AND m.university_id = p_university_id AND m.is_active)
  ) THEN
    RAISE EXCEPTION 'This email already manages the selected institution' USING ERRCODE = '23505';
  END IF;
  expires_value := now() + make_interval(hours => p_expires_hours);
  invite_url := 'https://uniecoghana.com/institution-admin-invite?token=' || token;
  INSERT INTO public.institution_admin_invitations(token_hash, recipient_email, university_id, invited_by, note, expires_at)
  VALUES (encode(extensions.digest(token, 'sha256'), 'hex'), email_value, p_university_id, uid, NULLIF(btrim(p_note), ''), expires_value)
  RETURNING id INTO invite_id;
  PERFORM public.enqueue_trusted_communication_event(
    'institution_admin_invitation', NULL, email_value, NULL,
    'You are invited to manage ' || institution_name || ' on UniEco Ghana', ARRAY['email']::text[],
    jsonb_build_object('template', 'institution_admin_invitation', 'institution_name', institution_name,
      'invite_url', invite_url, 'action_url', invite_url, 'expires_at', expires_value,
      'note', NULLIF(btrim(p_note), ''))
  );
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (uid, uid, 'institution_admin_invitation_created', 'institution_admin_invitations', invite_id,
    jsonb_build_object('university_id', p_university_id, 'recipient_email', email_value, 'expires_at', expires_value, 'note', p_note));
  RETURN jsonb_build_object('id', invite_id, 'recipient_email', email_value, 'institution_name', institution_name, 'expires_at', expires_value);
END $$;

CREATE OR REPLACE FUNCTION public.get_institution_admin_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  IF NULLIF(btrim(p_token), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invitation link is missing');
  END IF;
  SELECT jsonb_build_object('valid', true, 'recipient_email', invite.recipient_email,
    'institution_name', university.name, 'institution_short_name', university.short_name,
    'expires_at', invite.expires_at)
  INTO result
  FROM public.institution_admin_invitations invite
  JOIN public.universities university ON university.id = invite.university_id
  WHERE invite.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND invite.accepted_at IS NULL AND invite.expires_at > now();
  RETURN COALESCE(result, jsonb_build_object('valid', false, 'message', 'This invitation is invalid, expired, or already used'));
END $$;

CREATE OR REPLACE FUNCTION public.accept_institution_admin_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  uid uuid := auth.uid();
  invite public.institution_admin_invitations%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  institution_name text;
  old_role smallint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO invite FROM public.institution_admin_invitations
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND accepted_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation is invalid, expired, or already used' USING ERRCODE = '42501'; END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND OR lower(profile_row.email) IS DISTINCT FROM invite.recipient_email THEN
    RAISE EXCEPTION 'Sign in with the invited email address to accept this invitation' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO institution_name FROM public.universities WHERE id = invite.university_id AND is_enabled;
  IF institution_name IS NULL THEN RAISE EXCEPTION 'The assigned institution is no longer available' USING ERRCODE = '22023'; END IF;
  old_role := profile_row.role_id;
  IF old_role NOT IN (2, 3, 4, 7) THEN
    RAISE EXCEPTION 'This account cannot be converted into an institution administrator' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET role_id = 7, university_id = invite.university_id, status = 'active', is_active = true, updated_at = now() WHERE id = uid;
  INSERT INTO public.university_admin_memberships(user_id, university_id, is_active, assigned_by, assigned_at, revoked_at)
  VALUES (uid, invite.university_id, true, invite.invited_by, now(), NULL)
  ON CONFLICT (user_id, university_id) DO UPDATE SET is_active = true, assigned_by = EXCLUDED.assigned_by, assigned_at = EXCLUDED.assigned_at, revoked_at = NULL, updated_at = now();
  UPDATE public.institution_admin_invitations SET accepted_at = now(), accepted_by = uid WHERE id = invite.id;
  IF old_role IS DISTINCT FROM 7 THEN
    INSERT INTO public.role_transition_audit(target_user_id, old_role_id, new_role_id, actor_id, reason)
    VALUES (uid, old_role, 7, invite.invited_by, 'Accepted institution administrator invitation');
  END IF;
  INSERT INTO public.audit_logs(actor_id, target_id, action, entity_type, entity_id, metadata)
  VALUES (uid, uid, 'institution_admin_invitation_accepted', 'institution_admin_invitations', invite.id,
    jsonb_build_object('university_id', invite.university_id, 'institution_name', institution_name));
  RETURN jsonb_build_object('accepted', true, 'institution_id', invite.university_id, 'institution_name', institution_name);
END $$;

REVOKE ALL ON FUNCTION public.create_institution_admin_invite(uuid,text,integer,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_institution_admin_invite(uuid,text,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_institution_admin_invite(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_admin_invite(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_institution_admin_invite(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_institution_admin_invite(text) TO authenticated;

COMMIT;
