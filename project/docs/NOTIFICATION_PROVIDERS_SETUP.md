# UniEco notification providers

Paystack is not required for any notification channel. UniEco uses Supabase
for in-app notifications, Resend for email, and browser Web Push for device
alerts. SMS remains a later Hubtel integration because SMS delivery requires
credits.

## 1. Supabase in-app notifications

This channel is already part of the application. Keep these existing values in
the production Supabase project and do not expose the service-role key in a
`NEXT_PUBLIC_` variable.

Required server values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UNIECO_INTERNAL_FUNCTION_SECRET`

The internal secret must be the same value used by the trusted dispatcher and
the provider functions. Generate a long random value and store it only as a
Supabase Edge Function secret and a Railway server variable.

## 2. Resend email

1. Create a Resend account.
2. Add `uniecoghana.com` under Domains.
3. Copy the DNS records Resend provides into the domain DNS manager.
4. Wait for Resend to show the domain as verified.
5. Create an API key restricted to sending email.
6. Add these server-side secrets to Supabase Edge Functions and Railway:

```text
RESEND_API_KEY=re_...
EMAIL_FROM_ADDRESS=noreply@uniecoghana.com
EMAIL_FROM_NAME=UniEco Ghana
UNIECO_ENABLE_OUTBOUND_PROVIDERS=true
```

Do not put `RESEND_API_KEY` in a `NEXT_PUBLIC_` variable or commit it to Git.

## 3. Browser Web Push

Generate VAPID keys on a trusted computer:

```text
npx web-push generate-vapid-keys
```

Store the generated values as server/Edge Function secrets:

```text
VAPID_SUBJECT=mailto:info@uniecoghana.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
UNIECO_ENABLE_OUTBOUND_PROVIDERS=true
```

The public key is returned only to authenticated users by
`/api/notifications/push-config`. The private key must never be exposed to the
browser. Users enable push from Dashboard → Notifications → Preferences.

## 4. Deployment order

1. Add the secrets in Supabase Edge Function settings.
2. Add the same server-only values in Railway Variables.
3. Deploy the Edge Functions `send-email`, `send-push`, and
   `dispatch-communication-queue`.
4. Deploy the application.
5. Sign in with a test account, enable push, and verify the subscription is
   present in `push_subscriptions`.
6. Send one test email and one test push before enabling broad notification
   categories.

The provider switch is intentionally off until the credentials and dispatcher
are ready. Set `UNIECO_ENABLE_OUTBOUND_PROVIDERS=true` only after the first
controlled test.
