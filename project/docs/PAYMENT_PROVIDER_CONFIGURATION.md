# Payment provider configuration checklist

## Staging-first workflow

Use a separate Supabase project for staging. Its Project URL and publishable
key belong in `.env.staging.local` with `UNIECO_ENV=staging`; do not replace
the production `.env` values. This file is a local operator configuration and
must remain untracked.

The protected Bolt database remains the default legacy configuration in `.env`.
It is not staging or production. Use `npm.cmd run dev:staging`,
`npm.cmd run build:staging`, and `npm.cmd run start:staging` for the dedicated
staging project. These commands validate the staging project reference before
starting Next.js and prevent Supabase variables from falling back to `.env`.
Use `npm.cmd run env:check:default` and `npm.cmd run env:check:staging` to
verify the two local environment boundaries without contacting either database.

Before applying migrations, link the Supabase CLI to the staging project and
confirm `supabase migration list` identifies that project. Authentication for
the CLI and any database password must be entered by the operator or supplied
through a secure secret manager, never committed or pasted into this file.

Apply migrations in numeric order only after a staging backup/recovery point:

1. `20260911220000_0029_phase_a1_identity_authorization_hardening.sql`
2. `20260911230000_0030_phase_a2_financial_authority.sql`
3. `20260911231000_0031_private_message_attachments.sql`

Run the Phase A1 and A2 SQL matrices using isolated staging role fixtures
before any production review. Staging must keep Paystack and Flutterwave
disabled unless intentionally configured with sandbox-only credentials.

## Required Supabase Edge Function secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — Edge Function only; never expose it to the browser.
- `PAYSTACK_SECRET_KEY` — required to validate Paystack `x-paystack-signature` HMAC-SHA512.
- `FLUTTERWAVE_WEBHOOK_SECRET_HASH` — required to validate Flutterwave `verif-hash`.

Deploy the `payment-webhook` Edge Function and register its exact HTTPS URL in the provider dashboard. The endpoint accepts only signed `POST` requests and has no browser CORS policy.

## Activation sequence

1. Keep every provider disabled in `payment_providers` until server-side initiation, redirect/prompt handling, and webhook confirmation have been tested with the provider sandbox.
2. Configure the provider secret as an Edge Function secret, not in `NEXT_PUBLIC_*`, a database `config` field, source control, browser logs, or documentation screenshots.
3. Send signed sandbox success, failure, duplicate-delivery, wrong-amount, and wrong-currency events. Confirm only the legitimate event changes the payment.
4. Confirm subscription activation, invoice creation, and receipt issuance happen only after the success event.
5. Configure a provider-specific server refund adapter before allowing any refund to move from `approved` to `processing`.
6. For Hubtel, obtain and implement the current official webhook-signature and transaction-verification specification first; Phase A2 intentionally rejects it rather than guessing its security contract.

## Outbound communication guard

Set `UNIECO_INTERNAL_FUNCTION_SECRET` in Supabase before deploying `send-email`, `send-push`, `send-sms`, or `send-whatsapp`. Only a server-side dispatcher that holds this secret may call these provider functions using `x-unieco-internal-secret`. Browser code is intentionally blocked from invoking them; it cannot safely be trusted to choose a recipient or claim an event occurred.

## References

- [Paystack webhooks](https://paystack.com/docs/payments/webhooks/)
- [Flutterwave webhooks](https://developer.flutterwave.com/v2.0/reference/webhooks)
