-- Production-safe provider posture: no payment provider is enabled by default.
-- Activation remains a separately approved operational change made through
-- the existing super-admin authority path; this migration contains no secrets.
BEGIN;

UPDATE public.payment_providers
SET is_enabled = false,
    updated_at = now()
WHERE is_enabled IS DISTINCT FROM false;

COMMIT;
