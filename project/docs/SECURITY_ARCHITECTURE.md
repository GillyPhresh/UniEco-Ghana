# Security architecture

## Authority model

Supabase Auth authenticates a person. UniEco authorization is resolved from the database profile role joined to the role catalogue through the database role helper. This is intentional: auth user metadata, browser state, route guards, and custom JWT claims are not trusted as application-role authority.

Phase A1 supports visitor, student, student vendor, external vendor, moderator, super administrator, and university administrator roles. University administrator membership provides a university boundary. A university administrator is permitted only for an assigned university; platform super administrators remain separately scoped.

## Role lifecycle

Public registration creates a standard student role regardless of auth metadata. Vendor onboarding may request a vendor role only after the caller owns both the pending vendor profile and vendor record. Platform role changes use an audited role-assignment procedure that prohibits self-changes. University administrators are assigned through a separate procedure that also creates their university membership.

## RLS and data ownership

Phase A1 converts legacy RLS policies that checked an auth JWT role to call a database-backed role helper. It limits direct profile, student-profile, vendor-profile, vendor, location, and audit-log access:

- Profile role, activation, status, verification, and sensitive fields are not browser-updatable.
- Only safe profile fields are directly editable by their owner.
- Vendor and student verification state is changed only through audited RPCs.
- Vendor activation and user suspension are audited RPCs.
- Locations must belong to the caller, a caller-owned vendor, or a university the caller administers.
- Private student documents retain their storage object path, not a public URL.
- Audit rows are append-only server evidence.

Storage policies retain object-owner and staff checks, now backed by the same database role function. Do not add a storage policy that grants access from a client-provided owner id without checking it against the authenticated user.

## Browser responsibilities

The browser may render role-aware navigation for usability, but it cannot decide authorization. AuthProvider loads the profile role from Supabase and maps it to a display role. It no longer reads user metadata for a role. Sensitive client actions call a database RPC, and each RPC independently validates the caller.

## Operational requirements

Apply the migration to a staging Supabase project first and execute the Phase A1 RLS test matrix with distinct test accounts. Investigate any existing remote custom access-token hook before production deployment; Phase A1 intentionally does not depend on one. Review historic profile roles and the role-transition audit before production rollout.

Payments and payment webhooks, edge-function caller controls, rate limits, reviews, and fraud workflows need additional hardening in later phases; they are not declared complete by Phase A1.
