# Student registration payments and referral rewards

## Current implementation boundary

Student onboarding creates a registration intent through `begin_student_registration_payment`. The intent is stored in the existing `payments` table as `student_registration`, with the fee loaded from `student_financial_settings`. The existing Paystack server adapter initializes checkout and performs the GHS-to-pesewa conversion. The browser callback only polls the existing payment-status API.

The existing signed Paystack webhook and transaction verification remain the authority. Registration intents retain one immutable attempt row per provider payment, including the expected amount, currency, configuration version and environment. The verified-payment trigger validates against that attempt snapshot (not the current settings), activates a pending registration, and creates at most one reward row for a qualified one-level referral. Referral reward amounts and settlement dates are snapshotted; no user balance is edited. RLS and grants deny direct access to financial tables, including service-role table writes; trusted definer operations perform mutations.

The established platform-wide `current_app_role()` is not modified. Registration-specific authorization checks the caller from `auth.uid()`, the established DB-backed application role, active account state, and existing registration state. The signup route carries a referral code forward, but the database validates and locks attribution when the first payment intent is created.

The student summary RPC is read-only. A separate idempotent `service_role` settlement RPC advances due eligible rewards and an append-only reward-event table records creation and state transitions. The admin financial overview is super-admin-only. Student payout destinations are not marked verified by this code, and payout requests fail closed until a trusted verification process exists. Payout allocations and paid-reward reversal cases are represented, but no provider transfer workflow exists.

## Not ready for money movement

The repository did not contain Paystack transfer-recipient, transfer-initiation, or transfer-webhook reconciliation support. This change intentionally does not claim or mark payouts as paid and does not add an unverified manual completion action. A transfer adapter, recipient verification, and idempotent transfer status/reconciliation RPCs must be implemented and tested before payouts can be enabled. Paystack remains subject to the existing test/live environment guards; no live payment or transfer was enabled.

The student referral programme terms and settlement/payout rules require legal and compliance review before public launch. Settings currently use safe initial values (GHS 10 fee, GHS 2 reward, 24-hour settlement, GHS 10 minimum); changes should be performed through a future audited privileged configuration workflow, not direct client writes.

## Migration and validation

Migration `20261001090000_0105_student_registration_referrals.sql` remains unapplied. Run `supabase/tests/0105_referral_catalog_integrity.sql` only on an isolated disposable local database after migrations are loaded. This workspace has no local PostgreSQL, Docker, or Supabase CLI runtime, so SQL/RLS execution tests have not been run. Static/security tests and application build checks do not replace that required validation. Staging workflow validation remains a separate authorized phase.
