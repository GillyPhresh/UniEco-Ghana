# UniEco Ghana: hardening and University Admin deployment

This release adds the University Administrator employment workflow, secure referral attribution, monthly scorecards, appointment letters, and destination-aware email/push notifications. It is mobile-first and keeps authority in Supabase rather than in browser state.

## What is protected

- Applicants can only submit for an open university window and only as an active student account.
- Super Admin review is required before an administrator assignment, role transition, token, or appointment letter is created.
- Administrator links contain a bearer token whose digest is stored in the database. The raw token is shown once.
- A registration is not counted for payment until the authoritative registration/payment transition qualifies it.
- Self-referrals, duplicate users, invalid/revoked links, and unverified registrations do not count.
- Earnings are calculated, approved, and marked paid in separate audited steps. No transfer is initiated by the migration.
- University administrators cannot open the Super Admin application review queue.
- Appointment email and push messages use the trusted communication queue and point to `/admin/university-admin`.

## Safe deployment order

Run these commands from the project directory, with the intended project already linked. Do not paste secrets into source files or commit them.

```powershell
npx.cmd supabase@latest link --project-ref <STAGING_PROJECT_REF>
npx.cmd supabase@latest migration list
npx.cmd supabase@latest db push
npx.cmd supabase@latest functions deploy send-email --project-ref <STAGING_PROJECT_REF> --use-api
npx.cmd supabase@latest functions deploy send-push --project-ref <STAGING_PROJECT_REF> --use-api
npx.cmd supabase@latest functions deploy dispatch-communication-queue --project-ref <STAGING_PROJECT_REF> --use-api
npx.cmd supabase@latest migration list
```

Verify on staging before production:

1. Open `/university-admin/apply` as an eligible student.
2. Open an application window from `/admin/university-administrators` as Super Admin.
3. Submit an application, move it to review, and approve it.
4. Confirm the appointment letter, email/push queue event, role transition, and one-time referral link.
5. Register a test student and vendor through the link. Confirm the referral remains pending until the normal qualification rule is met.
6. Confirm an administrator cannot open `/admin/university-administrators` directly.
7. Test a notification click and verify it lands on the actionable page, not only the dashboard.
8. Test Paystack with the provider's test environment and verify webhook signature, transaction verification, idempotency, and the final account state.

Only after staging passes should the same migration/function commands be run against the production project reference. Railway must then deploy the commit from `deploy-main`, and the production environment must contain the matching public URL, provider flags, internal function secret, email credentials, push VAPID keys, and Supabase project values.

## Operational checks after release

- Confirm the communication queue scheduler is active and that failed/stale claims recover.
- Confirm Paystack webhook and callback logs contain no secrets or raw authorization headers.
- Confirm the system-health queue count is zero or explained by an active incident.
- Confirm database backups and point-in-time recovery are enabled for the production project.
- Review audit logs for role changes, application decisions, token issuance/revocation, payment transitions, and payout status changes.
- Keep the compensation rate at zero until the programme terms and payout approval process are formally approved.

## Mobile acceptance gate

Test the application and admin screens on a narrow viewport before release. Buttons must remain reachable with a thumb, inputs must not require horizontal scrolling, dialogs must respect safe-area insets, and loading/error states must be visible without a desktop-only hover interaction.
