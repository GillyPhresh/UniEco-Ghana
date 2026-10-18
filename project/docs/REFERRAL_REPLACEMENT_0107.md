# UniEco Ghana referral replacement — migration 0107

This is a newly approved replacement migration. It is not the recovered original `20261001090000_0105_student_registration_referrals.sql`; the original could not be verified in the authorized recovery sources.

## Approved policy

- Reward: GH₵2 for each eligible referred student.
- Qualification: the referred student must have a verified registration payment and `student_profiles.is_verified_student = true`.
- Settlement: the reward remains pending for 168 hours (seven days) after qualification.
- Integrity: one attribution and one reward per referred student, with ledger-backed status transitions and append-only reward events.
- Payouts: payout destinations and withdrawal requests fail closed until a separately verified transfer workflow exists.

## Files

- `supabase/migrations/20261017180000_0107_student_referral_replacement.sql`
- `app/api/student-referrals/me/route.ts`
- `app/dashboard/referrals/page.tsx`

## Validation boundary

The migration has not been applied to production or staging in this phase. The local static/security suite passes. Before applying it, run the migration on an isolated disposable Supabase/Postgres database, verify the complete migration chain, and test payment qualification, later student verification, seven-day settlement, duplicate attempts, self-referral rejection, and payout fail-closed behavior.
