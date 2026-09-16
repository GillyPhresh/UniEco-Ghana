# Financial architecture

## Authority boundaries

The browser may request checkout, a payment intent, cancellation of subscription auto-renewal, or a refund review/request. It cannot set a payment to successful, activate a subscription, create an invoice, issue a receipt, change a financial amount, or redeem a coupon.

`20260911230000_0030_phase_a2_financial_authority.sql` is the authoritative workflow layer. It derives the product/service price, vendor, university, delivery fee, coupon eligibility, discount, order total, and subscription price from database records. Product stock is reserved for 30 minutes at checkout and consumed only after a verified online payment.

The current delivery rule is deliberately explicit: delivery is a temporary server-side GH₵10 flat fee. It must be replaced with a university/location-aware delivery pricing service before geographic delivery rates are launched.

## Payment lifecycle

1. The client calls an RPC with only an entity ID, provider, optional mobile details, and an idempotency key.
2. The database creates a pending or initiated payment with a server-generated reference and immutable audit/status history.
3. A provider webhook validates its provider signature and then calls `apply_verified_payment_webhook` using the Supabase service role.
4. The database compares provider, payment reference, amount, and currency to the expected payment before updating state.
5. Only a verified success creates a receipt and activates/extends a vendor subscription. A marketplace success consumes valid stock reservations.

Manual marketplace payments are `cash_on_delivery`; manual subscriptions are `pending`. Neither is a successful payment. Provider refunds are intentionally not automated until a provider-specific, server-side refund adapter is configured.

## Subscription pricing

The database applies GH₵20 only when all of these are true: the vendor is marked as a student business, the current database role is `student_vendor`, and the linked student profile is verified. Every other vendor pays GH₵50. A UI plan choice cannot lower the amount.

## Refunds and auditability

Refund requests are bounded by the original verified payment amount and go through `requested → approved/rejected → processing/processed/failed`. The current review RPC records approval only; it does not falsely claim money has been returned. `transaction_audit_log`, `payment_status_history`, webhook-event keys, and receipt/payment unique indexes provide an auditable, idempotent record.

## Operational limits

This repository does not contain payment-provider credentials and no live provider is enabled by this phase. Do not enable Paystack, Flutterwave, Hubtel, or another provider until its server initiation flow, credentials, callback endpoint, and test transactions have been completed. Hubtel is deliberately not accepted by the webhook function because a verified official signature contract was not available in the repository.

Expired stock reservations are ignored for availability. Add a scheduled cleanup job that marks them `released` and cancels associated unpaid orders before sustained production traffic.
