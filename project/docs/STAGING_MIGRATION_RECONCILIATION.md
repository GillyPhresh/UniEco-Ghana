# Staging database reconciliation

Checked 2026-11-08. This runbook records read-only checks only; no staging or production database was changed.

## Verified state

- Staging project: `nyrrhoufgpqpajutatfp` (`unieco-ghana-staging`), active and healthy. The repository's local Supabase CLI link was pointed to staging during these checks.
- Staging migration ledger: 26 rows, from `20260910900000` through `20260928050000`.
- Production migration ledger (queried explicitly by project ref): 164 rows, latest `20261104100000` (`0181`). No production migration was applied.
- `supabase db push --dry-run --linked` stopped because eight migrations `0038`–`0045` are missing before a later recorded remote migration.
- `supabase db push --dry-run --linked --include-all` proposed **145 migrations**. This includes migrations that remove/reset non-admin accounts, activate all tertiary institutions, and change payment/referral workflows. Do not run that plan as a bulk fix.
- Read-only staging catalog probes confirmed migrations `0182`–`0187` are not reflected in the database: the payout approval guard, university-admin community functions, owner-safe v2 post-delete function, `campus_feed_sources.source_kind`, and the push endpoint constraint are absent.
- A read-only `to_regprocedure` probe found only 1 of the 25 RPCs targeted by candidate `0189` in staging; 24 are absent. This confirms `0189` cannot be applied by itself and depends on first reconciling and applying the prerequisite schema chain.
- The staging security advisor reported one mutable function search path and anonymous execute permission on the campus launch-status admin RPC. Inspection confirmed that RPC also checks for a signed-in super admin. Migration `0188` prepares least-privilege grants and a pinned search path; it has not been applied.
- The staging security advisor also reported leaked-password protection disabled and `pg_trgm` installed in `public`. These need a staging Auth configuration review and a dependency-aware extension-schema plan, respectively; neither was changed. Its other 51 authenticated `SECURITY DEFINER` execute notices need function-by-function authority review rather than blanket revocation. Performance advisors also surfaced multiple permissive RLS policies that require scope-aware consolidation, not automatic policy deletion.
- A separate read-only production security-advisor review found 42 `SECURITY DEFINER` functions with anonymous execute grants. They divide into 10 trigger-only functions, 25 authenticated workflows that should not be callable anonymously, and 7 intentional public read/token-lookup RPCs. Migration `0189` removes the first 35 anonymous/public grants while preserving authenticated access to the 25 workflows and leaving the public allowlist unchanged. It is a reviewed candidate only: it has not been applied, and the incomplete local database cannot validate all referenced function signatures.
- Management API-backed `supabase db query` works. `db dump` and `db lint` could not connect because the temporary `cli_login_postgres` database login failed password authentication. No password was printed or changed.

## Safe next steps

1. In the project dashboard, verify `nyrrhoufgpqpajutatfp` is selected and obtain its database password from the team's password manager. Do not send the password in chat.
2. In a local PowerShell session, set `SUPABASE_DB_PASSWORD` from the password manager for that session only. Confirm `supabase status --workdir .` identifies `unieco-ghana-staging` before any linked command.
3. Produce a schema-only dump to a temporary path and run staging lint:

   ```powershell
   $dumpPath = Join-Path $env:TEMP 'unieco-staging-public-schema.sql'
   .\node_modules\.bin\supabase.cmd db dump --linked --schema public --file $dumpPath --workdir .
   .\node_modules\.bin\supabase.cmd db lint --linked --workdir .
   ```

   Compare that schema with the 145-file dry-run plan and inspect every data-changing migration, especially account, institution, payment, and referral migrations.
4. Reconcile the migration ledger only after the schema comparison proves which migrations' effects are already present. Do not use `migration repair` to make history look current without object/data evidence.
5. Prepare an ordered, reviewed staging rollout with a backup and rollback plan. Apply a small coherent batch, then run SQL/RLS tests, two-tenant isolation checks, and the corresponding UI/API workflows before the next batch.
6. Validate candidate `0189` against the complete staging schema and inspect every targeted function's signature and authorization behavior. Apply it only after the earlier migration history is safely reconciled and staging tests prove the grants; then re-run the advisor and representative public/authenticated workflows.
7. Only after staging passes, prepare a separate production migration window and request explicit approval. The current production ledger is still at `0181`.

## Local verification

On 2026-11-08, the repository suite passed 289/289 Node tests; the security profile passed 128/128; TypeScript passed; lint passed with 57 existing warnings; production build completed; and `supabase db test --local` passed all 29 executable pgTAP assertions. Two prose-only SQL checklists were moved to `docs/DATABASE_AUTHORIZATION_TEST_MATRICES.md` because the Supabase runner had treated them as tests and failed with “No plan found.” Candidate `0189` was also rehearsed inside a local PostgreSQL transaction using temporary no-op stubs for functions absent from the incomplete local schema: all trigger/authenticated/public grant assertions passed, then the transaction rolled back. A follow-up catalog query confirmed the stubs were removed and the pre-existing launch-status grant was unchanged. This validates SQL syntax and ACL behavior only; it does not validate function bodies/signatures against the full staging schema or authorize applying the migration. The local database has only 89 migrations through `20261018100000`, so it cannot prove `0189` is executable against staging or production. These results do not prove the staging schema or migration history is ready for a bulk rollout.
