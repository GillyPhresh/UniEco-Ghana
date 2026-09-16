/*
# Convert helper functions to SECURITY INVOKER

is_staff() and has_permission() only read from role_permissions (which has a
public SELECT policy) and auth.jwt(). They do not need elevated privileges, so
SECURITY INVOKER is safe and removes the SECURITY DEFINER linter warnings.
*/

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'role' IN ('moderator', 'super_admin'), false);
$$;

CREATE OR REPLACE FUNCTION has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = auth.jwt() ->> 'role'
    AND rp.permission = perm
  );
$$;