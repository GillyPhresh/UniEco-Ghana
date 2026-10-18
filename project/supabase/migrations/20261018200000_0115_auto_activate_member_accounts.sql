-- Member accounts must be usable immediately after signup.
-- Identity/business verification remains separate and stays pending until reviewed.
BEGIN;

-- Repair legacy member profiles that were incorrectly blocked by an account-level
-- pending state. Never change staff/admin accounts or verification columns here.
UPDATE public.profiles AS profile
SET is_active=true, status='active', updated_at=now()
FROM public.user_roles AS role
WHERE role.id=profile.role_id
  AND role.name IN ('student','student_vendor','external_vendor')
  AND profile.status IN ('pending','pending_approval');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE v_student_role_id smallint;
BEGIN
  SELECT id INTO v_student_role_id
  FROM public.user_roles
  WHERE name='student'
  LIMIT 1;

  INSERT INTO public.profiles(
    id,email,role_id,full_name,avatar_url,is_active,status
  )
  VALUES(
    NEW.id,NEW.email,COALESCE(v_student_role_id,2),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',true,'active'
  )
  ON CONFLICT(id) DO UPDATE SET
    email=EXCLUDED.email,
    is_active=true,
    status=CASE
      WHEN public.profiles.status IN ('pending','pending_approval') THEN 'active'
      ELSE public.profiles.status
    END,
    updated_at=now();

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
