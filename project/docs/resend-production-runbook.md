# UniEco Ghana email operations

All user-facing links in these messages must use `https://www.uniecoghana.com`.

## Provider configuration

Configure these secrets in the production Supabase Edge Functions environment:

```text
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=UniEco Ghana <notifications@uniecoghana.com>
UNIECO_INTERNAL_FUNCTION_SECRET=<same trusted secret used by the queue worker>
UNIECO_ENABLE_OUTBOUND_PROVIDERS=true
```

The `notifications@uniecoghana.com` sender must be a verified Resend domain/sender. Never put `RESEND_API_KEY` in Railway, Next.js public variables, browser code, or Git.

## Database and functions

Apply the migration in the Supabase production SQL Editor, then deploy the trusted functions:

```powershell
supabase functions deploy send-email --project-ref inslzwciwhberfpljmod
supabase functions deploy dispatch-communication-queue --project-ref inslzwciwhberfpljmod
```

Run the queue worker every few minutes using the existing trusted scheduler. The worker claims at most 25 messages per run and retries failed deliveries with server-controlled backoff.

## Automated messages

- New account: congratulations/welcome email and in-app notification.
- Successful, failed, cancelled, and refunded payments: customer email and payment notification.
- New and paid invoices: invoice email and payment notification.
- Approved broadcasts: audience fan-out through the same trusted queue, with Resend idempotency protection.

Transactional messages are generated server-side. Admin broadcast content is escaped before being placed in HTML email, and the existing staff approval/reason workflow remains required for bulk delivery.

## Smoke test

1. Create a test account on `https://www.uniecoghana.com/signup`.
2. Confirm a `registration_welcome` event is queued and an email is received.
3. Use a Paystack test payment and verify `payment_successful` plus the receipt email after the verified webhook.
4. From `https://www.uniecoghana.com/admin/broadcasts`, create a small test broadcast, submit it, approve it, and queue it for delivery.
5. Check Resend logs, the UniEco Communication Hub, and the failed/queued counts before sending to a larger audience.
