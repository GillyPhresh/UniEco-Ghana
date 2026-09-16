-- Phase A1 grant correction for Supabase's default API-role function grants.
-- This does not alter A1 authorization logic, RLS, or function bodies.
BEGIN;

-- Remove all default/public and API-role execute privileges from every A1
-- function first. The narrow grants below restore only the intended browser
-- RPC/helper boundary; trigger functions remain non-callable directly.
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_app_role(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_university(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_application_role(uuid, smallint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_profile_status(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_vendor_role(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_student_verification(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_vendor_verification(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_vendor_active(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_university_administrator(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_profile_status_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

-- A1's intended public RPC surface: authenticated callers only. Each
-- privileged workflow still performs its own database-backed authorization.
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_university(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_application_role(uuid, smallint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_status(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_vendor_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_student_verification(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_vendor_verification(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_vendor_active(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_university_administrator(uuid, uuid, text) TO authenticated;

COMMIT;
