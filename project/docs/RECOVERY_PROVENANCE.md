# Recovery provenance

This repository is the isolated Phase R5 recovered candidate. The original
corrupted workspace, verified backup, and Phase R4 repository remain separate.

## Recovered database source

The inspected UniEco Production Deploy directory contains 26 readable SQL
files: the clean staging baseline, the pgcrypto setup, and migrations 0029–0045.
The recovered staged migration set contains 86 migration files, through 0104,
according to the recovery inventory. The presence of a migration file in this
candidate does not prove that it was applied to any remote database.

The following migration-source ranges were not recovered from the locations
inspected: 0001–0028, 0046–0058, 0060–0104, and the original migration 0105.
These are recovery findings for the sources inspected, not proof that every
numbered migration existed or was previously applied.

Migration 0059 has a recovered source candidate, but its provenance and
compatibility concern remain visible: its `RETURNS TABLE` declaration uses the
unquoted output column `current_role`, which raises a PostgreSQL compatibility
concern. It is not silently repaired or replaced in this phase.

The original 0105 source was not recovered from the inspected local Git
history, dangling objects, backup, or remote GitHub repository. The isolated
0105 reconstruction is not authoritative and remains excluded from the staged
migration set.

## Reconstructed edge functions

The following files were reconstructed locally because no readable source copy
was found:

- `supabase/functions/_shared/internal-auth.ts`
- `supabase/functions/get-student-verification-document-url/index.ts`

They passed the project security suite, but must not be represented as
authoritative recovered originals without source provenance and owner review.
They remain excluded from the staged set.

## Validation status

The candidate passed the available migration replay, 110/110 security tests,
typecheck, lint, and a production build using temporary placeholder
configuration. No hosted database, deployment target, or protected legacy
project was accessed. These recovery findings and local validation results do
not establish which migrations are currently applied to staging or production,
that the complete original migration history has been recovered, or that this
candidate is authorized for deployment.
