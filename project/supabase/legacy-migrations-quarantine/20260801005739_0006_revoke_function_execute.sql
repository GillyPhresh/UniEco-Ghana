/*
# Revoke PUBLIC execute on trigger and helper functions

- log_profile_status_change: trigger-only function, should not be callable via RPC.
  Revoke from PUBLIC.
- is_staff, has_permission: intentionally callable by authenticated users only
  (already granted to authenticated). Revoke from anon/PUBLIC so unauthenticated
  callers cannot invoke them.
*/

REVOKE EXECUTE ON FUNCTION log_profile_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_permission(text) FROM PUBLIC;