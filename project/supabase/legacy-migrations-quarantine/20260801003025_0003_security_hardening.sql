/*
# Security hardening pass

## Changes
1. Enable RLS on user_roles and add a public read policy (role catalog is
   reference data that the app needs to read — it contains no sensitive info).
2. Fix mutable search_path on set_updated_at() by setting it explicitly.
3. Revoke EXECUTE on handle_new_user() from anon and authenticated — it is a
   trigger function meant to run only on auth.users insert, not to be called
   via the REST API.

## Security
- user_roles: RLS enabled, public SELECT (intentionally shared reference data),
  no INSERT/UPDATE/DELETE for anon/authenticated.
- handle_new_user: SECURITY DEFINER retained (needs to insert into profiles on
  behalf of the auth system), but EXECUTE revoked from public roles so it
  cannot be invoked via /rest/v1/rpc.
*/

-- 1. user_roles RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_user_roles" ON user_roles;
CREATE POLICY "public_select_user_roles"
ON user_roles FOR SELECT
TO anon, authenticated
USING (true);

-- 2. Fix search_path on set_updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Revoke EXECUTE on handle_new_user from anon and authenticated
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon, authenticated;