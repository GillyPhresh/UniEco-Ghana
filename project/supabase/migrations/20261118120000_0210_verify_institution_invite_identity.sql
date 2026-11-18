BEGIN;

CREATE OR REPLACE FUNCTION public.get_institution_admin_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result jsonb;
BEGIN
  IF NULLIF(btrim(p_token), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invitation link is missing');
  END IF;
  IF length(p_token) <> 68 OR p_token !~ '^UAI_[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'This invitation is invalid, expired, or already used');
  END IF;
  -- A link may be forwarded or inspected by a mail scanner. Do not disclose
  -- the invited mailbox to anyone who can open the link.
  SELECT jsonb_build_object('valid', true,
    'institution_name', university.name, 'institution_short_name', university.short_name,
    'expires_at', invite.expires_at)
  INTO result
  FROM public.institution_admin_invitations invite
  JOIN public.universities university ON university.id = invite.university_id
  WHERE invite.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND invite.accepted_at IS NULL AND invite.expires_at > now() AND university.is_enabled;
  RETURN COALESCE(result, jsonb_build_object('valid', false, 'message', 'This invitation is invalid, expired, or already used'));
END $$;

CREATE OR REPLACE FUNCTION public.accept_institution_admin_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  uid uuid := auth.uid();
  verified_email text;
  invite public.institution_admin_invitations%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  institution_name text;
  old_role smallint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_token IS NULL OR length(p_token) <> 68 OR p_token !~ '^UAI_[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'This invitation is invalid, expired, or already used' USING ERRCODE = '42501';
  END IF;
  -- auth.users, not a profile copy or a claim in an old JWT, is authoritative.
  SELECT lower(btrim(account.email)) INTO verified_email
  FROM auth.users account
  WHERE account.id = uid AND account.email_confirmed_at IS NOT NULL
  FOR SHARE;
  IF NULLIF(verified_email, '') IS NULL THEN
    RAISE EXCEPTION 'Sign in with the verified invited email address' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO invite FROM public.institution_admin_invitations
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND accepted_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation is invalid, expired, or already used' USING ERRCODE = '42501'; END IF;
  IF verified_email IS DISTINCT FROM invite.recipient_email THEN
    RAISE EXCEPTION 'Sign in with the verified invited email address' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Set up your UniEco account before accepting this invitation' USING ERRCODE = '42501'; END IF;
  SELECT name INTO institution_name FROM public.universities WHERE id = invite.university_id AND is_enabled;
  IF institution_name IS NULL THEN RAISE EXCEPTION 'The assigned institution is no longer available' USING ERRCODE = '22023'; END IF;
  old_role := profile_row.role_id;
  IF old_role IS NULL OR old_role NOT IN (2, 3, 4, 7) THEN
    RAISE EXCEPTION 'This account cannot be converted into an institution administrator' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET role_id = 7, university_id = invite.university_id, status = 'active', is_active = true, updated_at = now() WHERE id = uid;
  INSERT INTO public.university_admin_memberships(user_id, university_id, is_active, assigned_by, assigned_at, revoked_at)
  VALUES (uid, invite.university_id, true, invite.invited_by, now(), NULL)
  ON CONFLICT (user_id, university_id) DO UPDATE SET is_active = true, assigned_by = EXCLUDED.assigned_by, assigned_at = now(), revoked_at = NULL, updated_at = now();
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

REVOKE ALL ON FUNCTION public.get_institution_admin_invite(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_admin_invite(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_institution_admin_invite(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_institution_admin_invite(text) TO authenticated;

COMMIT;
