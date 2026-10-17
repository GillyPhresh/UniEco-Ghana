-- New student accounts can use the platform immediately after registration.
-- Student identity verification remains separate and continues to protect
-- verified-student and student-vendor workflows.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_role_id smallint;
BEGIN
  SELECT id INTO v_student_role_id
  FROM public.user_roles
  WHERE name = 'student'
  LIMIT 1;

  INSERT INTO public.profiles (
    id,
    email,
    role_id,
    full_name,
    avatar_url,
    is_active,
    status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_student_role_id, 2),
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    true,
    'active'
  );

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

