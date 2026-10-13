-- Prevent direct API invocation of trusted review-reputation maintenance helpers.
-- These SECURITY DEFINER functions are called only by database triggers and
-- privileged migration code; application clients have no valid use for them.
BEGIN;

REVOKE ALL ON FUNCTION public.recalculate_vendor_reputation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_review_reputation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_review_moderation_reputation() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
