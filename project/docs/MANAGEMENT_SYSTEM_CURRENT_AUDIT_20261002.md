# UniEco Ghana Management System — Current Audit and Issue Register

Audit date: 2026-10-02. This is a local repository review. It does not assert that local migrations are deployed to staging or production.

## Executive finding

The project already has a substantial management control center under `/admin`. Keep that route family and extend it; creating a parallel `/management` authorization or data layer would duplicate the existing system. The route shell is a presentation layer. The middleware resolves the role through `current_app_role()`, while resource RPCs/RLS must independently enforce capability and university scope.

The platform is **partially complete**, not production-ready. Local modules and source-level security coverage are broad, but several infrastructure-dependent modules remain intentionally absent and database behavior has not been exercised against staging. No fake operational counters or replacement authorization system should be added to fill those gaps.

## Architecture map

| Area | Existing implementation and reusable foundation | Current limitation / follow-up |
|---|---|---|
| Routes and shell | `/admin` pages; `components/admin/admin-layout.tsx`; responsive sidebar; `AdminRouteGuard` | Browser guard/navigation are UX only. Maintain middleware and DB checks as authority. Some moderator route policy is repeated in middleware and shell; no demonstrated security bypass, but drift risk exists. |
| Identity and authorization | `profiles.role_id`, `user_roles`, `current_app_role()`, `is_super_admin()`, `is_staff()`, `has_permission()`, `can_manage_university()`, active university-admin memberships | `lib/auth/permissions.ts` and `AuthContext` role mapping are UI hints, not authorization. Preserve this boundary. |
| University tenancy | Database-derived `can_manage_university()` and scoped read/mutation RPCs for universities, students, vendors, orders, businesses, announcements, events, and audit projections | Existing source/SQL test artifacts do not substitute for a completed end-to-end two-tenant run against PostgreSQL and the UI/API. |
| Overview and analytics | Separate platform and university-admin aggregates; count-only operational alerts; recent activity from trusted audit/action rows | Some requested metrics/queues are absent by design. Only display aggregates supported by authoritative source data. |
| User, student, vendor, university, business | Directory/read models, scoped verification and status workflows, branding, membership management, reasoned and audited actions | Full case/detail workflows and broader live integration coverage remain incomplete. |
| Orders and finance | Read-only scoped order/delivery monitoring; payment, invoice, subscription, and refund management paths; audited exports; existing payment provider boundary | No browser “mark paid” authority. Provider-side refund execution and live financial workflows remain disabled/unverified. |
| Verification and private files | Reviewer-gated queues and short-lived authorized document signing; private-storage architecture | Storage authorization and expiry require integration tests; public URLs must not be introduced for private documents. |
| Communications and support | Queue/dispatcher architecture, announcements, broadcast controls, support RPCs, scoped operational views | Provider delivery/replay and full failure recovery are not validated end-to-end. Personal notification preferences remain user-owned. |
| Moderation and trust | Reviews, advertisements, event reports, Trust & Safety cases, assignment/history, reasoned transitions and audit hooks | Event scheduling/cancellation/archive are unsupported by current workflows/schema; do not represent them as implemented. |
| CMS, search, health, audit | CMS/FAQ/announcements, bounded permission-aware search, measured health signals, narrowed audit viewer | Search coverage is deliberately limited; audit filters/snapshots and safe persisted settings/feature flags are incomplete. Health must label unmeasured providers as unmeasured/disabled. |
| Referral controls | Local referral page/API/migration work exists in the current worktree, alongside existing financial/provider authority | The referral migration’s behavior still requires its separately authorized isolated SQL/RLS test phase. Do not enable payouts or treat the feature as launch-ready. |
| CampusMate | No implemented CampusMate backend/control module was found in the inspected app, library, or migrations | Deferred until a real product backend exists; no placeholder controls or data. |

## Prioritized issue register

| Priority / category | Issue and root cause | Risk | Recommended fix and validation |
|---|---|---|---|
| HIGH — DATABASE / AUTHORIZATION | Most newer management migrations are local drafts; repository/source checks do not prove deployed schema, RLS, grants, or function behavior. | UI can call missing or differently deployed RPCs; tenancy behavior may differ from source assumptions. | After explicit staging authorization, review migration ledger and environment identity, then apply only the coherent forward chain. Exercise role and two-university cases through SQL/RLS, APIs, and UI. |
| HIGH — SECURITY / TESTING | The current run proves static controls, not the complete anonymous/student/vendor/staff/super-admin matrix or private-document/audit integrity against PostgreSQL. | Authorization regressions could escape source-pattern tests. | Run the existing SQL suites on an isolated disposable local Supabase-compatible database, then staging integration tests only when authorized. Keep results explicitly separated. |
| HIGH — FINANCIAL | Referral registration/reward/payout implementation is present as uncommitted work and is not launch-ready until the isolated behavioral test gate passes. | Financial state could be misinterpreted without verified settlement, idempotency, and reversal behavior. | Complete the authorized isolated 0105 SQL/RLS behavior tests before staging. Keep live Paystack and MoMo payouts disabled. |
| MEDIUM — CONFIGURATION | No complete safe runtime-settings or feature-flag authority was found. | Adding UI without database ownership/audit would create misleading or unsafe controls. | Design only when server-readable, role-controlled, environment-aware persistence and audited resource-specific mutations are specified. Keep infrastructure secrets out of settings. |
| MEDIUM — OPERATIONS | Communication provider replay/repair, support export, and some alert workflows are incomplete or unverified. | Operators may see failures without a safe recovery workflow. | Implement one provider-neutral, queue-backed recovery workflow at a time with idempotency, permission checks, and audit tests. |
| MEDIUM — SEARCH / REPORTING | Search/report coverage is intentionally bounded; some restricted domains are excluded. | Users may assume unsupported entities are searchable/exportable. | Document supported entities and add only privacy-reviewed, scoped, indexed server read models. |
| MEDIUM — AUDIT / EVENTS | Audit filters/snapshots are narrower than the full request; event schema/workflows lack some requested lifecycle operations. | Operational visibility/features may be incomplete. | Extend only with explicit schema support, reasoned legal transitions, and immutable audit evidence. |
| LOW — UX / ACCESSIBILITY / PERFORMANCE | Existing pages vary in responsive, loading/error, accessibility, and query-plan validation. Lint reports existing warnings. | Inconsistent operation experience and potential performance regressions. | Perform module-by-module accessibility and query-plan review after authorization correctness; do not bundle cosmetic work with security changes. |

## Current verification record

- `npm run test:security`: PASS, 110/110 static tests (before the discarded route-policy experiment; that experiment was reverted).
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with existing warnings.
- Targeted university-admin/admin authority suite: PASS, 50/50 static tests.
- Local migration validation: 0059’s quoted output-column repair passed in a fresh local PostgreSQL 18 scratch cluster; the full local migration chain through 0105 completed there. This was an isolated scratch database, not staging. 0105 behavioral tests were not run in that validation step.
- Final rerun after this audit: `npm run test:security` PASS, 110/110; focused authorization/admin tests PASS, 50/50; `npm run typecheck` PASS; `npm run lint` PASS with existing warnings; `git diff --check` PASS.
- No production, staging, Railway, or Bolt database was changed or deployed.

## Implementation boundary and next phase

The current first safe implementation slice is the already-existing `/admin` foundation and resource workflows; preserve them instead of building a second platform. The `0059` compatibility correction is a one-token, semantics-preserving prerequisite for university-admin membership workflows. Before broad new modules, close the HIGH database-behavior and financial-validation gaps. Staging work requires an explicit environment-identity check and a separate authorized staging phase. PROD-05, production, Railway production, and Bolt remain out of scope.
