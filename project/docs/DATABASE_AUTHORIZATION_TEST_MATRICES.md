# Database authorization and financial test matrices

These are acceptance criteria for isolated integration testing, not executable
SQL. Do not place prose-only checklists in `supabase/tests`: the Supabase CLI
executes every `.sql` file there as a pgTAP test, and a checklist without a
pgTAP plan makes the test command fail without exercising its assertions.

## Identity, authorization, and tenant isolation

Run against a disposable database after applying the complete migration chain.
Use purpose-created test accounts and university records; never use production
identities. Cover these role contexts: student A, student B, student-vendor A,
moderator, super admin, university admin A assigned to university A, and
university admin B.

1. Altering auth user metadata during signup must not assign a privileged role.
2. A student cannot change their role, status, activation, another profile,
   student-verification fields, or vendor-verification fields.
3. A student-vendor can update only their own permitted commercial fields and
   cannot set verification or activation flags.
4. A moderator can invoke review RPCs only when the database grants the
   matching operational permission; a student cannot invoke them.
5. Only a super admin can assign platform roles or university admins; neither
   actor may self-assign.
6. University admin A may update university A but is denied access to
   university B and B-owned locations; verify the reciprocal case for B.
7. Profile locations are owner-only while vendor and university locations
   follow their documented public-discovery policy.
8. Role-transition audit rows are visible only to the target and authorized
   administrators; direct insert, update, and delete are denied.
9. Private student/vendor document storage rejects cross-user reads, writes,
   and deletes; authorized staff access follows database roles.

Run the executable tenant-isolation suite in
`supabase/tests/management_tenant_isolation.sql` in addition to these broader
role and storage scenarios.

## Financial authority and checkout

Run against an isolated disposable database with synthetic products, users,
and payment events. Do not enable live Paystack or MoMo settlement for tests.

1. Authenticated clients cannot directly insert, update, or delete payments,
   receipts, invoices, refunds, order items, subscriptions, or coupon
   redemptions; direct order insertion is denied.
2. Repeating a checkout with the same idempotency key returns the same order
   and does not create a duplicate.
3. Forged product prices and totals are ignored; the server uses database
   prices and computed fees.
4. Competing checkouts cannot reserve the last stock unit twice; verified
   payment consumes stock once.
5. Direct coupon redemption is denied; a valid checkout creates one redemption
   and increments usage once.
6. Student-vendor subscription pricing applies only when both required
   verified roles are present; removing either property uses the standard rate.
7. Manual marketplace orders use cash-on-delivery; manual subscription intent
   remains pending and creates no receipt, invoice, or active subscription.
8. Replaying the same verified provider event is idempotent. Incorrect amount,
   currency, or reference is rejected, with no duplicate financial records.
9. Provider webhook application and private message attachment reads are
   restricted to their intended service/participant authorities.
10. Referral payout reservation, allocation, retry, settlement, failure, and
    reversal paths preserve ledger totals and are idempotent under retries.

These checks require fixtures and role/JWT setup; static Node tests do not
substitute for executing them against the complete database schema.
