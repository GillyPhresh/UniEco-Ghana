# Paystack Ghana payments (PROD-04)

UniEco creates an authoritative payment record before contacting Paystack. The browser receives only a hosted checkout URL and can never mark a payment paid.

## Required configuration

Set these outside Git, separately for each Railway environment and the `payment-webhook` Supabase Edge Function:

- `UNIECO_PUBLIC_APP_URL` — current Railway public URL; replace later when the approved custom domain exists.
- `PAYSTACK_ENABLED` — `true` only after a controlled test/live activation.
- `PAYSTACK_MODE` — `test` in staging; `live` only in production after approval.
- `PAYSTACK_SECRET_KEY` — matching Paystack test or live server secret; never use `NEXT_PUBLIC_`.
- `PAYSTACK_LIVE_ENABLED` — must be `true` in addition to the previous settings before a production process can initialize live payments.

Current production configuration uses:

```env
UNIECO_PUBLIC_APP_URL=https://uniecoghana.up.railway.app
```

The current production health endpoint is `https://uniecoghana.up.railway.app/api/health`. Do not use the retired `uniecoghana-production` Railway hostname. `uniecoghana.com` remains deferred until it is purchased and configured; at that time only `UNIECO_PUBLIC_APP_URL` needs to change.

Set the Paystack dashboard webhook URL to the deployed Supabase Edge Function `payment-webhook`. It validates the raw body using `x-paystack-signature` HMAC SHA-512 and verifies `charge.success` through Paystack's Verify Transaction API before applying anything.

## Merchant channels

The `payment_providers` row for `paystack` is the non-secret source of enabled checkout channels. Its `config.channels` may contain only merchant-enabled values (`card`, `mobile_money`, `bank_transfer`), and `supported_methods` must match. Ghana Mobile Money providers use Paystack-hosted checkout and therefore show only what the merchant account enables. Current Paystack codes are MTN `mtn`, AirtelTigo/ATMoney `atl` or current merchant-supported equivalent, and Telecel `vod`; do not add a method merely because it exists in code.

MoMo requires authorisation on the customer phone and can remain pending. UniEco waits for the verified webhook; the callback page is status-only. Mobile Money renewal is customer-initiated, not automatic recurring charging.

## Safety and operations

- Amounts, currency, references, order totals, subscription fees (GHS 20 student / GHS 50 external), receipts, and fulfillment are database/server authoritative.
- Duplicate provider events and a second event for an already-successful payment are idempotent. Subscription periods, receipts, stock consumption, and order confirmation cannot be applied twice.
- Amount, currency, provider, or test/live environment mismatches move the payment to `reconciliation_required` and create a protected reconciliation record.
- Vendor activation remains in its existing trusted verification workflow; neither a redirect nor a browser action can activate a vendor.
- Refund requests remain audited and provider refund execution is intentionally deferred until a trusted Paystack refund operation is separately approved.

To disable Paystack safely, set `PAYSTACK_ENABLED=false` and disable the `paystack` provider row through the approved administrator workflow. To rotate a key, disable checkout, replace the secret in the environment and Edge Function secrets, verify staging test mode, then re-enable only after review.

## Staging procedure

Use `PAYSTACK_MODE=test` with a test secret only. Configure the staging webhook, enable the staging Paystack provider with the merchant's actual test-enabled channels, and test successful, failed/pending/abandoned, duplicate, invalid-signature, amount mismatch, callback-only, and webhook-only paths. Never put live credentials in staging.
