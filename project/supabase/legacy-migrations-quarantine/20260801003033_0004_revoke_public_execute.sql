/*
# Revoke PUBLIC execute on handle_new_user

Postgres functions default to granting EXECUTE to PUBLIC (all roles).
Revoking from anon and authenticated individually is insufficient because
PUBLIC still grants access. This revokes from PUBLIC explicitly, then
re-grants nothing — the function is only called by the trigger on auth.users.
*/

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC;