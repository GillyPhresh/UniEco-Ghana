-- Enable the configured Paystack checkout channels for production registration
-- and marketplace flows. The server still requires the matching Railway secret
-- configuration before it can initialize a transaction.
BEGIN;

UPDATE public.payment_providers
SET is_enabled = true,
    config = COALESCE(config, '{}'::jsonb)
      || jsonb_build_object('channels', jsonb_build_array('card', 'mobile_money')),
    updated_at = now()
WHERE name = 'paystack';

COMMIT;
