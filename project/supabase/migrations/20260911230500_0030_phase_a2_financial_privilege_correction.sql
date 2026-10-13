-- Correct explicit Supabase API-role grants left on A2 SECURITY DEFINER functions.
-- Function bodies, RLS conditions, and financial schema remain unchanged.
BEGIN;

-- Internal helpers are callable only by trusted SECURITY DEFINER workflows.
REVOKE ALL ON FUNCTION public.financial_reference(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_financial_rate_limit(text, integer) FROM PUBLIC, anon, authenticated, service_role;

-- These client-facing workflows validate auth.uid() and authorization inside
-- their existing function bodies. They are never anonymous or service-role APIs.
REVOKE ALL ON FUNCTION public.create_subscription_payment_intent(uuid, text, text, text, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_marketplace_checkout(jsonb, text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_marketplace_payment_intent(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_subscription_auto_renew(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_payment_refund(uuid, numeric, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_payment_refund(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_subscription_payment_intent(uuid, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_checkout(jsonb, text, jsonb, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_payment_intent(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_subscription_auto_renew(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payment_refund(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_payment_refund(uuid, boolean, text) TO authenticated;

-- Verified provider webhooks are service-role-only; no browser role can invoke
-- the payment-state transition function or persist webhook event payloads.
REVOKE ALL ON FUNCTION public.apply_verified_payment_webhook(text, text, text, text, text, text, numeric, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_verified_payment_webhook(text, text, text, text, text, text, numeric, text, jsonb) TO service_role;
REVOKE ALL ON TABLE public.payment_webhook_events FROM PUBLIC, anon, authenticated;

COMMIT;
