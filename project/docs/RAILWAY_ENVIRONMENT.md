# Railway environment contract

Railway uses Nixpacks with `npm ci && npm run build`, then `npm run start:railway`.
The start wrapper rejects the protected Bolt project, rejects an incorrect staging
project, and rejects use of staging as production.

## Required public build/runtime variables

- `UNIECO_ENV` — `staging` or `production`.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

For staging, the URL must use project ref `nyrrhoufgpqpajutatfp`.
Production must use a separately created project and may never use the Bolt or
staging project.

## Server/internal variables

- `SUPABASE_SERVICE_ROLE_KEY`
- `UNIECO_INTERNAL_FUNCTION_SECRET`

These must never be prefixed `NEXT_PUBLIC_` or committed. They are only needed
when the corresponding trusted server/Edge Function capability is deployed.

## Deferred provider variables

Payment, webhook, email, SMS, WhatsApp, and VAPID variables listed in
`.env.example` remain unset until their providers and trusted dispatcher are
explicitly enabled. Do not add placeholders with real values to Git.
