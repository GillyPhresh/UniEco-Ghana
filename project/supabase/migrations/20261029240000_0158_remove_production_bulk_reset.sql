-- Bulk deletion of every non-admin account is not a safe production feature.
-- Remove the old RPC as well as its management-console button. Normal account
-- suspension/reactivation and audited, scoped admin actions remain available.
BEGIN;

DROP FUNCTION IF EXISTS public.admin_reset_non_admin_accounts(text, text);

COMMIT;
