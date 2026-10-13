# UniEco Ghana project rules

These rules apply to every module and deployment environment.

1. Supabase is the authoritative backend and database. Railway hosts the Next.js application; it is not a replacement database.
2. Database-backed application roles, ownership checks, and RLS are the authorization source of truth. UI guards, browser state, and JWT/user metadata may improve experience but never grant access.
3. Public sign-up always begins as a standard student account. Role changes occur only through audited database workflows. Never grant platform or university authority from a predictable index number, client input, or editable auth metadata.
4. Keep the platform multi-university. University-specific content, branding, policies, and authorization must be data-driven; do not hard-code UENR assumptions.
5. Payments, prices, order totals, payment status, refunds, subscriptions, and webhooks are server-authoritative. Never trust a browser success state or client-submitted financial amount.
6. Use the existing system before adding a new one: extend, refactor, and consolidate rather than duplicate.
7. RLS, database constraints, server-side validation, least privilege, and audit trails are required for sensitive data and state changes.
8. Storage buckets must have least-privilege policies. Private documents store object paths and require authorized signed URLs; never persist an assumed public URL for a private bucket.
9. Do not manufacture businesses, transactions, reviews, analytics, universities, or testimonials. Use honest empty states where real data does not exist.
10. Do not expose service-role keys, provider secrets, private user locations, verification documents, or credentials in browser code, client logs, or public repositories.
11. Keep private dashboards and personal data out of search indexing. Public entity pages require truthful, data-backed metadata.
12. Before changing a schema, policy, authentication flow, or payment flow, inspect its dependencies and add proportional tests.
