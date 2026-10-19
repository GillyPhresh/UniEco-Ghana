import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
// Normalize repository line endings so structural checks behave consistently
// on Windows and Linux CI runners.
const read = async (path) => (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');

test('admin mutations use narrow audited RPCs with authenticated authority', async () => {
  const migration = await read('supabase/migrations/20260911242000_0038_admin_authority_consolidation.sql');
  const procedures = ['create_admin_university','update_admin_university','set_admin_university_enabled','set_admin_university_branding','create_admin_category','update_admin_category','delete_admin_category','review_admin_advertisement','resolve_admin_report','add_admin_ticket_reply','assign_admin_support_ticket','close_admin_support_ticket','create_admin_cms_page','update_admin_cms_page','delete_admin_cms_page','create_admin_faq','update_admin_faq','delete_admin_faq','create_admin_announcement','update_admin_announcement','delete_admin_announcement'];
  for (const procedure of procedures) assert.match(migration, new RegExp(`FUNCTION public\\.${procedure}\\(`));
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_admin_university[\s\S]*FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_admin_university[\s\S]*TO authenticated/);
  assert.match(migration, /INSERT INTO public\.admin_actions \(admin_id[\s\S]*auth\.uid\(\)/);
  assert.match(migration, /DROP POLICY IF EXISTS advertisements_staff_manage/);
  assert.match(migration, /DROP POLICY IF EXISTS reports_staff_update/);
  assert.match(migration, /DROP POLICY IF EXISTS tickets_owner_manage/);
  assert.match(migration, /DROP POLICY IF EXISTS announcements_staff_manage/);
  assert.match(migration, /CREATE POLICY support_tickets_owner_insert[\s\S]*WITH CHECK\(user_id=auth\.uid\(\)\)/);
});

test('search quality reporting is super-admin-only and exposes aggregate data only', async () => {
  const migration = await read('supabase/migrations/20260930008000_0086_admin_search_quality_aggregates.sql');
  const analyticsMigration = await read('supabase/migrations/20260930009000_0087_search_quality_uses_privacy_safe_analytics.sql');
  const client = await read('lib/data/admin-client.ts');
  const page = await read('app/admin/search/page.tsx');
  const publicSearch = await read('app/search/page.tsx');
  const telemetry = await read('lib/data/analytics-client.ts');
  const searchNormalizer = await read('lib/utils/search.ts');
  const marketplace = await read('lib/data/marketplace-client.ts');
  const discover = await read('app/discover/page.tsx');
  const publicQueries = await read('lib/data/public-queries.ts');
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(migration, /v_days NOT IN \(7, 30, 90\)/);
  assert.match(analyticsMigration, /FROM public\.analytics_events event/);
  assert.match(analyticsMigration, /event\.event_type = 'search' AND event\.result_count = 0/);
  assert.match(analyticsMigration, /event\.event_type = 'search_result_click'/);
  assert.match(analyticsMigration, /auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_search_quality_metrics[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_admin_search_quality_metrics\(integer\) TO authenticated/);
  assert.match(client, /rpc\('get_admin_search_quality_metrics'/);
  assert.match(page, /user\?\.role === 'super_admin'/);
  assert.doesNotMatch(page, /query_text|session_id/);
  assert.match(publicSearch, /trackAnalyticsEvent\(\{[\s\S]*event_type: 'search'/);
  assert.match(publicSearch, /event_type: 'search_result_click'/);
  assert.match(telemetry, /if \(!user\) return/);
  assert.doesNotMatch(telemetry, /query_text|session_id/);
  assert.match(searchNormalizer, /replace\(\/\[\^\\p\{L\}\\p\{N\}\\s'-\]/);
  assert.match(searchNormalizer, /slice\(0, maxLength\)/);
  assert.match(publicSearch, /normalizeSearchTerm\(query\)/);
  assert.match(marketplace, /normalizeSearchTerm\(params\.query/);
  assert.match(discover, /normalizeSearchTerm\(searchQuery\)/);
  assert.doesNotMatch(publicSearch, /%\$\{query\}%/);
  assert.doesNotMatch(marketplace, /%\$\{params\.query\}%/);
  assert.doesNotMatch(discover, /%\$\{searchQuery\}%/);
  assert.match(publicQueries, /normalizeSearchTerm\(query\)/);
  assert.match(publicQueries, /Math\.min\(20, Math\.max\(1, Math\.trunc\(limit\)\)\)/);
  assert.doesNotMatch(publicQueries, /%\$\{query\}%/);
});

test('admin state machines and university scope are database enforced', async () => {
  const migration = await read('supabase/migrations/20260911242000_0038_admin_authority_consolidation.sql');
  assert.match(migration, /p_decision NOT IN \('approved','rejected'\)/);
  assert.match(migration, /status='pending' FOR UPDATE/);
  assert.match(migration, /status='open'/);
  assert.match(migration, /status IN \('open','in_progress','resolved'\)/);
  assert.match(migration, /p_type NOT IN \('platform','university','maintenance','promotional'\)/);
  assert.match(migration, /public\.can_manage_university\(p_university_id\)/);
  assert.match(migration, /public\.current_app_role\(\)='university_admin'/);
  assert.match(migration, /university_branding_admin_write/);
});

test('active admin browser paths no longer write protected resources directly', async () => {
  const client = await read('lib/data/admin-client.ts');
  const protectedTables = 'universities|categories|advertisements|reports|cms_pages|cms_faq_entries|announcements|admin_actions';
  assert.doesNotMatch(client, new RegExp(`from\\('(?:${protectedTables})'\\)[\\s\\S]{0,180}?\\.(?:insert|update|upsert|delete)\\(`));
  assert.doesNotMatch(client, /from\('support_tickets'\)[\s\S]{0,180}?\.(?:update|upsert|delete)\(/);
  assert.doesNotMatch(client, /from\('ticket_replies'\)[\s\S]{0,180}?\.insert\(/);
  assert.doesNotMatch(client, /error\?\.message|error\.message/, 'management data wrappers must not expose raw provider or database errors');
  assert.match(client, /Unable to upload this image\. Check its format, size, and your university permissions\./);
  assert.match(client, /Unable to extend the subscription\. Verify its status and your permissions\./);
  for (const procedure of ['create_admin_university','update_admin_university','review_admin_advertisement','resolve_admin_report','add_admin_ticket_reply','create_admin_cms_page','create_admin_announcement']) assert.match(client, new RegExp(`rpc\\('${procedure}'`));
  assert.doesNotMatch(client, /logAdminAction/);
});

test('admin URL requests fail closed in middleware using the database-backed role', async () => {
  const middleware = await read('lib/supabase/middleware.ts');
  assert.match(middleware, /supabase\.auth\.getUser\(\)/);
  assert.match(middleware, /supabase\.rpc\('current_app_role'\)/);
  assert.match(middleware, /role === 'super_admin'/);
  assert.match(middleware, /role === 'moderator' && moderatorPermission/);
  assert.match(middleware, /supabase\.rpc\('has_permission'/);
  assert.match(middleware, /pathname === '\/admin\/moderation'/);
  assert.match(middleware, /'can_review_verifications'/);
  assert.match(middleware, /role === 'university_admin' && \(/);
  assert.match(middleware, /pathname === '\/admin\/universities'/);
  assert.match(middleware, /pathname === '\/admin\/announcements'/);
  assert.match(middleware, /new NextResponse\('Forbidden', \{ status: 403 \}\)/);
  assert.match(middleware, /Cache-Control', 'private, no-store, max-age=0'/);
  assert.match(middleware, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
  assert.doesNotMatch(middleware, /user_metadata|localStorage|sessionStorage/);
});

test('two-university database isolation suite covers tenant readers and forged mutations transactionally', async () => {
  const integration = await read('supabase/tests/management_tenant_isolation.sql');
  assert.match(integration, /SELECT plan\(29\)/);
  assert.match(integration, /SET LOCAL ROLE authenticated/);
  for (const reader of ['get_admin_universities', 'get_admin_student_directory', 'get_admin_business_directory', 'get_admin_order_monitoring', 'get_admin_announcements']) {
    assert.match(integration, new RegExp(`public\\.${reader}\\(`));
  }
  assert.match(integration, /A cannot create an announcement for B/);
  assert.match(integration, /A cannot edit B notices/);
  assert.match(integration, /A cannot delete B notices/);
  assert.match(integration, /Authenticated clients cannot directly update announcements/);
  assert.match(integration, /Authenticated clients cannot directly update university records/);
  assert.match(integration, /B order monitor excludes A orders/);
  assert.match(integration, /ROLLBACK;/);
  assert.doesNotMatch(integration, /https?:\/\//);
});

test('admin finance uses database aggregates and audited super-admin exports', async () => {
  const migration = await read('supabase/migrations/20260929010000_0055_admin_financial_summary.sql');
  const paymentClient = await read('lib/data/payment-client.ts');
  const financePage = await read('app/admin/financial/page.tsx');
  const exportRoute = await read('app/api/admin/financial/export/route.ts');
  const summaryReader = paymentClient.match(/export async function getRevenueStats\(\)[\s\S]*?\n}\n/);

  assert.ok(summaryReader, 'financial summary reader exists');
  assert.match(summaryReader[0], /rpc\('get_admin_financial_summary'\)/);
  assert.doesNotMatch(summaryReader[0], /from\('payments'\)|from\('refunds'\)/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(migration, /status='success' AND p\.currency='GHS'/);
  assert.match(migration, /public\.record_trusted_admin_action\(\s*'financial\.export'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_financial_summary\(\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_admin_financial_summary\(\) TO authenticated/);
  assert.match(exportRoute, /export async function POST\(request: NextRequest\)/);
  assert.match(exportRoute, /request\.headers\.get\('origin'\) !== request\.nextUrl\.origin/);
  assert.match(exportRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(exportRoute, /rpc\('export_admin_financial_summary'\)/);
  assert.match(exportRoute, /Cache-Control': 'private, no-store/);
  assert.match(exportRoute, /csvCell/);
  assert.match(financePage, /fetch\('\/api\/admin\/financial\/export'/);
  assert.doesNotMatch(financePage, /getRevenueByUniversity|exportToCsv|GH₵0\.00 \(future\)/);
});

test('management overview uses one authorized aggregate and truthful time series', async () => {
  const migration = await read('supabase/migrations/20260929020000_0056_admin_control_center_summary.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const dashboard = await read('app/admin/page.tsx');
  const analytics = await read('app/admin/analytics/page.tsx');
  const summaryReader = adminClient.match(/export async function getAdminControlCenterSummary\([\s\S]*?\n}\n/);

  assert.ok(summaryReader, 'control-center data reader exists');
  assert.match(summaryReader[0], /rpc\('get_admin_control_center_summary'/);
  assert.match(summaryReader[0], /if \(error \|\| !data/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(migration, /p_days NOT BETWEEN 7 AND 90/);
  assert.match(migration, /generate_series\(v_first_day::timestamp, v_today::timestamp/);
  assert.match(migration, /created_at::date AS day, count\(\*\)/);
  assert.match(migration, /'pendingVendorVerification'/);
  assert.match(migration, /'pendingAdApprovals'/);
  assert.match(migration, /'unresolvedSupportTickets'/);
  assert.doesNotMatch(migration, /'totalRevenue'/);
  assert.match(dashboard, /summary\.registrationTrend/);
  assert.match(dashboard, /summary\.orderTrend/);
  assert.match(dashboard, /Pending Vendor Verification/);
  assert.match(dashboard, /PendingActionLinks actions=\{pendingActions\}/);
  assert.match(dashboard, /href: '\/admin\/verification\/vendors'/);
  assert.match(dashboard, /href: '\/admin\/advertisements'/);
  assert.match(dashboard, /href: '\/admin\/support'/);
  assert.match(dashboard, /No outstanding items in these queues/);
  assert.doesNotMatch(dashboard, /totalRevenue|Current period/);
  assert.match(analytics, /summary\.universityGrowth/);
  assert.match(analytics, /Active Businesses by Category/);
});

test('system health reports only measured signals and protects operational metadata', async () => {
  const migration = await read('supabase/migrations/20260929030000_0057_admin_system_health_summary.sql');
  const route = await read('app/api/admin/system-health/route.ts');
  const page = await read('app/admin/system-health/page.tsx');

  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(migration, /'exhausted'/);
  assert.match(migration, /'stuckProcessing'/);
  assert.match(migration, /'externalEnabled'/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /rpc\('current_app_role'\)/);
  assert.match(route, /role !== 'super_admin'/);
  assert.match(route, /rpc\('get_admin_system_health_summary'\)/);
  assert.match(route, /Cache-Control': 'private, no-store/);
  assert.doesNotMatch(route, /service_role|PAYSTACK_SECRET_KEY|error\.message/);
  assert.match(route, /not_measured/);
  assert.match(page, /fetch\('\/api\/admin\/system-health'/);
  assert.match(page, /not_measured/);
  assert.doesNotMatch(page, /listBuckets|No critical errors detected|Architecture is prepared for future monitoring integrations/);
});

test('university management listings are database-scoped and fail visibly', async () => {
  const migration = await read('supabase/migrations/20260929040000_0058_admin_university_listing_scope.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const universityPage = await read('app/admin/universities/page.tsx');
  const listing = adminClient.match(/export async function getAdminUniversities\(\)[\s\S]*?\n}\n/);

  assert.ok(listing, 'university listing reader exists');
  assert.match(listing[0], /rpc\('get_admin_universities'\)/);
  assert.match(listing[0], /if \(error \|\| !data\) throw/);
  assert.doesNotMatch(listing[0], /from\('universities'\)|university_admin_memberships/);
  assert.match(migration, /auth\.uid\(\) IS NULL/);
  assert.match(migration, /v_role IS NULL OR v_role NOT IN/);
  assert.match(migration, /WHERE public\.can_manage_university\(u\.id\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_universities\(\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(universityPage, /setUniversities\(await getAdminUniversities\(\)\)/);
  assert.match(universityPage, /Unable to load universities/);
  assert.doesNotMatch(universityPage, /getMyUniversityAdminScopes|data\.filter\(uni => scopeIds/);
});

test('role matrix identifies UI hints without claiming authorization authority', async () => {
  const rolesPage = await read('app/admin/roles/page.tsx');
  const permissions = await read('lib/auth/permissions.ts');

  assert.match(rolesPage, /Read-only overview of role labels and UI capability hints/);
  assert.match(rolesPage, /static matrix is a UI reference only; it does not grant or enforce access/);
  assert.doesNotMatch(rolesPage, /JWT role claims|matrix is enforced at two levels/);
  assert.match(permissions, /UI affordances only/);
});

test('university administrator membership changes require scope, reasons, and audit evidence', async () => {
  const migration = await read('supabase/migrations/20260929050000_0059_university_admin_membership_workflow.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const universityPage = await read('app/admin/universities/page.tsx');

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.assign_university_administrator/);
  assert.match(migration, /length\(clean_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.revoke_university_administrator/);
  assert.match(migration, /FROM public\.profiles WHERE id=p_target_user_id FOR UPDATE/);
  assert.match(migration, /WHERE user_id=p_target_user_id AND is_active/);
  assert.match(migration, /UPDATE public\.profiles SET role_id=2/);
  assert.match(migration, /INSERT INTO public\.role_transition_audit/);
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /INSERT INTO public\.admin_actions/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.search_university_admin_candidates/);
  assert.match(migration, /LIMIT 20/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_admin_university_memberships/);
  for (const rpc of ['assign_university_administrator','revoke_university_administrator','get_admin_university_memberships','search_university_admin_candidates']) {
    assert.match(adminClient, new RegExp(`rpc\\('${rpc}'`));
  }
  assert.match(universityPage, /reason between 10 and 500 characters/);
  assert.match(universityPage, /requestAssignAdministrator\(candidate\)/);
  assert.match(universityPage, /setPendingMembershipAction\(\{ kind: 'revoke'/);
  assert.match(universityPage, /Confirm administrator/);
  assert.match(universityPage, /Grant \$\{pendingMembershipAction\.targetName\} university administrator access/);
  assert.match(universityPage, /void confirmMembershipAction\(\)/);
  assert.doesNotMatch(universityPage, /window\.confirm/);
  assert.doesNotMatch(universityPage, /from\('university_admin_memberships'\)\.(?:insert|update|delete)/);
});

test('order monitoring is read-only, database-scoped, and cannot use browser exports', async () => {
  const migration = await read('supabase/migrations/20260929060000_0060_admin_order_monitoring_scope.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const ordersPage = await read('app/admin/orders/page.tsx');
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const orderReader = adminClient.match(/export async function getAdminOrders[\s\S]*?\n}\n/);

  assert.ok(orderReader, 'order monitoring reader exists');
  assert.match(orderReader[0], /rpc\('get_admin_order_monitoring'/);
  assert.doesNotMatch(orderReader[0], /from\('orders'\)/);
  assert.match(migration, /current_app_role\(\)/);
  assert.match(migration, /v_role NOT IN \('super_admin', 'university_admin'\)/);
  assert.match(migration, /public\.can_manage_university\(o\.university_id\)/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_order_monitoring/);
  assert.match(migration, /get_admin_order_monitoring_summary/);
  assert.match(ordersPage, /useDeferredValue/);
  assert.match(ordersPage, /Unable to load orders/);
  assert.doesNotMatch(ordersPage, /exportToCsv|handleExport|Download/);
  assert.match(middleware, /pathname === '\/admin\/universities' \|\| pathname === '\/admin\/orders'/);
  assert.match(layout, /pathname === '\/admin\/universities' \|\| pathname === '\/admin\/orders'/);
});

test('delivery operations are read-only, paginated, tenant-scoped, and privacy-minimized', async () => {
  const migration = await read('supabase/migrations/20260930003000_0081_admin_delivery_operations.sql');
  const client = await read('lib/data/admin-client.ts');
  const page = await read('app/admin/delivery/page.tsx');
  const middleware = await read('lib/supabase/middleware.ts');
  const reader = client.match(/export async function getAdminDeliveryOperations[\s\S]*?\n}\n/);

  assert.ok(reader, 'delivery operations reader exists');
  assert.match(reader[0], /rpc\('get_admin_delivery_operations'/);
  assert.match(migration, /v_role NOT IN \('super_admin', 'university_admin'\)/);
  assert.match(migration, /public\.can_manage_university\(o\.university_id\)/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_delivery_operations/);
  assert.doesNotMatch(migration, /delivery_address|delivery_instructions|total_amount|buyer_email|fulfillment\.note/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|vendor_transition_order|customer_confirm_order_handoff/);
  assert.match(middleware, /pathname === '\/admin\/delivery'/);
  assert.match(page, /No delivery operations match your filters/);
  assert.match(page, /Unable to load delivery operations/);
});

test('Trust and Safety cases use the existing report-review capability, legal transitions, and trusted audit', async () => {
  const migration = await read('supabase/migrations/20260930004000_0082_admin_trust_safety_cases.sql');
  const page = await read('app/admin/trust-safety/page.tsx');
  const adminClient = await read('lib/data/admin-client.ts');
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');

  assert.match(migration, /public\.has_permission\('can_review_reports'\)/);
  assert.match(migration, /moderation_case_events\(case_id, event_type, actor_id, details\)/);
  assert.match(migration, /record_trusted_admin_action\(/);
  assert.match(migration, /v_transition_allowed/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.update_admin_moderation_case/);
  assert.match(page, /statusTransitions/);
  assert.match(page, /decision reason/i);
  assert.match(page, /updateAdminModerationCase\(selected\.id, nextStatus, reason\)/);
  assert.match(page, /No Trust & Safety cases match your filters/);
  assert.match(middleware, /pathname === '\/admin\/trust-safety'/);
  assert.match(layout, /moderatorPermissions\.has\('can_review_reports'\)/);
  assert.match(adminClient, /rpc\('get_admin_moderation_cases'/);
  assert.match(adminClient, /rpc\('update_admin_moderation_case'/);
});

test('event moderation is assigned-capability and university scoped with reasoned trusted mutations', async () => {
  const migration = await read('supabase/migrations/20260930005000_0083_admin_event_moderation.sql');
  const page = await read('app/admin/events/page.tsx');
  const client = await read('lib/data/admin-client.ts');
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const reader = client.match(/export async function getAdminEventModerationFlags[\s\S]*?\n}\n/);

  assert.ok(reader, 'event moderation read wrapper exists');
  assert.match(reader[0], /rpc\('get_admin_event_moderation_queue'/);
  assert.match(migration, /public\.has_permission\('can_moderate_content'\)/);
  assert.match(migration, /public\.can_manage_university\(event\.university_id\)/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /record_trusted_university_event_action/);
  assert.match(migration, /record_trusted_admin_action/);
  assert.match(migration, /A moderation reason between 10 and 1000 characters is required/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.review_admin_event_flag/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(page, /Approve and publish/);
  assert.match(page, /Hide event/);
  assert.match(page, /Dismiss report/);
  assert.match(middleware, /pathname === '\/admin\/events'/);
  assert.match(layout, /item\.href === '\/admin\/events' && moderatorPermissions\.has\('can_moderate_content'\)/);
});

test('event operations use bounded database scope and audited visibility transitions', async () => {
  const migration = await read('supabase/migrations/20260930011000_0089_admin_event_operations.sql');
  const page = await read('app/admin/events/page.tsx');
  const client = await read('lib/data/admin-client.ts');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_admin_event_operations/);
  assert.match(migration, /public\.can_manage_university\(event\.university_id\)/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_admin_event_visibility/);
  assert.match(migration, /SELECT \* INTO v_event FROM public\.events WHERE id = p_event_id FOR UPDATE/);
  assert.match(migration, /length\(v_reason\) < 10 OR length\(v_reason\) > 1000/);
  assert.match(migration, /record_trusted_university_event_action/);
  assert.match(migration, /record_trusted_admin_action/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_admin_event_visibility[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(client, /rpc\('get_admin_event_operations'/);
  assert.match(client, /rpc\('set_admin_event_visibility'/);
  assert.doesNotMatch(page, /supabase\.from\(['"]events['"]\)[\s\S]*?\.(?:insert|update|delete)\(/);
  assert.match(page, /Every change requires a reason and is audited/);
  assert.match(page, /user\?\.role === 'super_admin' \|\| user\?\.role === 'university_admin'/);
  assert.match(page, /if \(!canManageEventVisibility\)/);
});

test('vendor suspension and reactivation require scoped authority, reasons, and audits', async () => {
  const [superAdminGuard, migration, adminClient, businessPage, verificationPage] = await Promise.all([
    read('supabase/migrations/20260930012000_0090_vendor_status_superadmin_reasoned.sql'),
    read('supabase/migrations/20260930013000_0091_university_scoped_vendor_operations.sql'),
    read('lib/data/admin-client.ts'),
    read('app/admin/businesses/page.tsx'),
    read('app/admin/verification/vendors/page.tsx'),
  ]);
  assert.match(superAdminGuard, /NOT public\.is_super_admin\(\)/);
  assert.match(migration, /public\.is_super_admin\(\) OR v_role = 'university_admin'/);
  assert.match(migration, /public\.can_manage_university\(v_vendor\.university_id\)/);
  assert.match(migration, /length\(v_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(migration, /FROM public\.vendors WHERE id = p_vendor_id FOR UPDATE/);
  assert.match(migration, /record_trusted_admin_action/);
  assert.match(migration, /'previous_is_active', v_vendor\.is_active/);
  assert.match(migration, /'current_is_active', p_is_active/);
  assert.match(migration, /public\.set_vendor_active\(uuid, boolean, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(adminClient, /export async function restoreVendor\(vendorId: string, reason: string\)/);
  assert.match(adminClient, /p_reason: reason\.trim\(\)/);
  const statusClient = adminClient.match(/export async function suspendVendor\([\s\S]*?\n}\n\n\/\/ ============================================================\n\/\/ Business Management/);
  assert.ok(statusClient, 'vendor status wrappers exist');
  assert.doesNotMatch(statusClient[0], /error\.message/);
  assert.match(statusClient[0], /p_reason: reason/);
  assert.match(businessPage, /restoreVendor\(selected\.id, actionReason\.trim\(\)\)/);
  assert.match(businessPage, /onClick=\{\(\) => requestAction\('restore'\)\}/);
  assert.match(businessPage, /await restoreVendor\(selected\.id, actionReason\.trim\(\)\)/);
  assert.match(businessPage, /Confirm restoration/);
  assert.match(verificationPage, /const isSuperAdmin = user\?\.role === 'super_admin'/);
  assert.match(verificationPage, /canManageVendors && \(selected\.is_active \?/);
  assert.match(verificationPage, /restoreVendor\(selected\.id, reason\.trim\(\)\)/);
  assert.match(verificationPage, /requestStatusAction\('approve'\)/);
  assert.match(verificationPage, /requestStatusAction\('reject'\)/);
  assert.match(verificationPage, /requestStatusAction\('suspend'\)/);
  assert.match(verificationPage, /action === 'reject'[\s\S]*?rejectVendor\(selected\.id, reason\.trim\(\)\)/);
  assert.match(verificationPage, /pendingStatusAction === 'reject'[\s\S]*?Confirm rejection/);
  assert.doesNotMatch(verificationPage, /onClick=\{handleReject\}/);
  assert.match(verificationPage, /Confirm vendor/);
  assert.match(verificationPage, /void confirmStatusAction\(\)/);
  assert.doesNotMatch(verificationPage, /'Suspended by admin'/);
});

test('university vendor verification uses tenant-scoped reads, decisions, and audit records', async () => {
  const [migration, middleware, layout, page, dashboard, client] = await Promise.all([
    read('supabase/migrations/20260930013000_0091_university_scoped_vendor_operations.sql'),
    read('lib/supabase/middleware.ts'),
    read('components/admin/admin-layout.tsx'),
    read('app/admin/verification/vendors/page.tsx'),
    read('app/admin/page.tsx'),
    read('lib/data/admin-client.ts'),
  ]);
  const queue = migration.match(/CREATE OR REPLACE FUNCTION public\.get_vendor_verification_queue\([\s\S]*?\$\$;/);
  const decision = migration.match(/CREATE OR REPLACE FUNCTION public\.review_vendor_verification\([\s\S]*?\$\$;/);
  assert.ok(queue);
  assert.ok(decision);
  assert.match(queue[0], /v_role = 'university_admin' AND public\.can_manage_university\(vendor\.university_id\)/);
  assert.match(queue[0], /CASE WHEN public\.is_super_admin\(\) OR public\.has_permission\('can_review_verifications'\)[\s\S]*THEN owner\.email ELSE NULL END/);
  assert.match(decision[0], /SELECT \* INTO v_vendor FROM public\.vendors WHERE id = p_vendor_id FOR UPDATE/);
  assert.match(decision[0], /v_role = 'university_admin' AND NOT public\.can_manage_university\(v_vendor\.university_id\)/);
  assert.match(decision[0], /record_trusted_university_vendor_action/);
  assert.match(migration, /record_trusted_university_vendor_action\([\s\S]*current_app_role\(\) IS DISTINCT FROM 'university_admin'[\s\S]*can_manage_university\(p_university_id\)/);
  assert.match(middleware, /pathname === '\/admin\/verification\/vendors'/);
  assert.match(layout, /item\.href === '\/admin\/verification\/vendors'/);
  assert.match(page, /const canManageVendors = isSuperAdmin \|\| user\?\.role === 'university_admin'/);
  assert.match(page, /reason\.trim\(\)\.length < 10/);
  assert.match(dashboard, /href: '\/admin\/verification\/vendors'/);
  assert.match(client, /rpc\('get_vendor_verification_queue'/);
  assert.match(client, /rpc\('review_vendor_verification'/);
  assert.doesNotMatch(page, /supabase\.from\(['"]vendors['"]\)[\s\S]*?\.(?:insert|update|delete)\(/);
});

test('Trust and Safety assignment and activity remain reviewer-scoped, reasoned, and audited', async () => {
  const [migration, page, client, types] = await Promise.all([
    read('supabase/migrations/20260930007000_0085_trust_safety_assignment_history.sql'),
    read('app/admin/trust-safety/page.tsx'),
    read('lib/data/admin-client.ts'),
    read('lib/types/admin.ts'),
  ]);
  assert.match(migration, /DROP POLICY IF EXISTS staff_only_moderation_cases/);
  assert.match(migration, /REVOKE SELECT ON public\.moderation_cases, public\.moderation_case_links, public\.moderation_case_events FROM anon, authenticated/);
  assert.match(migration, /FUNCTION public\.get_admin_moderation_reviewers[\s\S]*?public\.has_permission\('can_review_reports'\)/);
  assert.match(migration, /role\.name='moderator'[\s\S]*permission='can_review_reports'/);
  assert.match(migration, /FUNCTION public\.assign_admin_moderation_case[\s\S]*?FOR UPDATE/);
  assert.match(migration, /An assignment reason between 10 and 500 characters is required/);
  assert.match(migration, /Closed cases cannot be assigned/);
  assert.match(migration, /VALUES\(p_case_id,'assignment_changed',auth\.uid\(\)/);
  assert.match(migration, /record_trusted_admin_action\([\s\S]*trust_safety\.case_assigned/);
  assert.match(migration, /FUNCTION public\.get_admin_moderation_case_events[\s\S]*?left\(NULLIF\(btrim\(event\.details->>'reason'\),''\),500\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*assign_admin_moderation_case/);
  assert.match(page, /getAdminModerationCaseEvents/);
  assert.match(page, /getAdminModerationReviewers/);
  assert.match(page, /requestAssignment/);
  assert.match(page, /Review assignment/);
  assert.match(page, /requestDecision/);
  assert.match(page, /Confirm Trust &amp; Safety/);
  assert.match(page, /Confirm assignment/);
  assert.match(page, /Confirm decision/);
  assert.match(page, /Reason: \{\(pendingCaseAction\?\.kind === 'assignment' \? assignmentReason : reason\)\.trim\(\)\}/);
  assert.doesNotMatch(page, /onClick=\{\(\) => void saveAssignment|onClick=\{\(\) => void saveDecision/);
  assert.match(page, /Case activity/);
  assert.match(client, /rpc\('assign_admin_moderation_case'/);
  assert.match(client, /rpc\('get_admin_moderation_case_events'/);
  assert.match(types, /interface AdminModerationCaseEvent/);
  assert.match(types, /assigned_to_id: string \| null/);
});

test('audit viewer uses a super-admin-only narrowed server read model', async () => {
  const migration = await read('supabase/migrations/20260929070000_0061_admin_audit_log_viewer.sql');
  const reasonMigration = await read('supabase/migrations/20260930001000_0079_admin_audit_reason_view.sql');
  const filterMigration = await read('supabase/migrations/20260930002000_0080_admin_audit_filters.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const auditPage = await read('app/admin/audit-logs/page.tsx');
  const reader = adminClient.match(/export async function getAdminActions[\s\S]*?\n}\n/);

  assert.ok(reader, 'audit action reader exists');
  assert.match(reader[0], /rpc\('get_admin_action_log_filtered'/);
  assert.match(reader[0], /uuidPattern\.test\(actorId\)/);
  assert.match(reader[0], /uuidPattern\.test\(targetId\)/);
  assert.match(reader[0], /Start date must not be after end date/);
  assert.doesNotMatch(reader[0], /from\('admin_actions'\)/);
  assert.match(migration, /NOT public\.is_super_admin\(\)/);
  assert.match(migration, /exposes no IP address or raw request metadata/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_action_log/);
  assert.match(reasonMigration, /NOT public\.is_super_admin\(\)/);
  assert.match(reasonMigration, /metadata->>'reason'/);
  assert.match(reasonMigration, /left\(regexp_replace[\s\S]*500/);
  assert.doesNotMatch(reasonMigration, /entry\.metadata\s*,/);
  assert.match(reasonMigration, /REVOKE ALL ON FUNCTION public\.get_admin_action_log_with_reason/);
  assert.match(filterMigration, /NOT public\.is_super_admin\(\)/);
  assert.match(filterMigration, /entry\.admin_id = p_actor_id/);
  assert.match(filterMigration, /entry\.target_id = p_target_id/);
  assert.match(filterMigration, /p_from_date/);
  assert.match(filterMigration, /p_to_date/);
  assert.match(filterMigration, /v_limit NOT BETWEEN 1 AND 100/);
  assert.match(filterMigration, /REVOKE ALL ON FUNCTION public\.get_admin_action_log_filtered/);
  assert.match(auditPage, /useDeferredValue/);
  assert.match(auditPage, /<TableHead>Reason<\/TableHead>/);
  assert.match(auditPage, /Actor profile UUID/);
  assert.match(auditPage, /Target resource UUID/);
  assert.match(auditPage, /Audit start date/);
  assert.match(auditPage, /Audit end date/);
  assert.match(auditPage, /Unable to load audit logs/);
});

test('vendor verification queue is a narrowed reviewer-only read model', async () => {
  const migration = await read('supabase/migrations/20260929080000_0062_vendor_verification_queue_read_model.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const vendorVerificationPage = await read('app/admin/verification/vendors/page.tsx');
  const reader = adminClient.match(/export async function getVendorVerifications[\s\S]*?\n}\n/);

  assert.ok(reader, 'verification queue reader exists');
  assert.match(reader[0], /rpc\('get_vendor_verification_queue'/);
  assert.doesNotMatch(reader[0], /from\('vendors'\)/);
  assert.match(migration, /has_permission\('can_review_verifications'\)/);
  assert.match(migration, /document paths/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_vendor_verification_queue/);
  assert.match(vendorVerificationPage, /Unable to load vendor verifications/);
});

test('user directory and privileged user actions are narrowed, reasoned, and audited', async () => {
  const migration = await read('supabase/migrations/20260929090000_0063_admin_user_directory_and_reasoned_actions.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const usersPage = await read('app/admin/users/page.tsx');
  const reader = adminClient.match(/export async function getAdminUsers[\s\S]*?\n}\n/);

  assert.ok(reader, 'user directory reader exists');
  assert.match(reader[0], /rpc\('get_admin_user_directory'/);
  assert.doesNotMatch(reader[0], /from\('profiles'\)/);
  assert.match(migration, /NOT public\.is_super_admin\(\)/);
  assert.match(migration, /length\(clean_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(migration, /p_new_role_id IN \(6,7\)/);
  assert.match(migration, /record_trusted_admin_action/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_user_directory/);
  assert.match(usersPage, /Reason for this privileged action/);
  assert.match(usersPage, /\['university_admin', 'super_admin'\]/);
  assert.match(usersPage, /requestUserAction\(\{ kind: 'role'/);
  assert.match(usersPage, /Confirm user/);
  assert.match(usersPage, /Reason: \{reason\.trim\(\)\}/);
  assert.match(usersPage, /void confirmUserAction\(\)/);
  assert.doesNotMatch(usersPage, /onClick=\{handle(?:Suspend|Reactivate|RoleAssign)\}/);
  assert.doesNotMatch(usersPage, /exportToCsv|handleExport/);
});

test('CMS public page saves require a target-specific confirmation while mutation remains super-admin RPC-only', async () => {
  const migration = await read('supabase/migrations/20260911242000_0038_admin_authority_consolidation.sql');
  const page = await read('app/admin/cms/page.tsx');
  const client = await read('lib/data/admin-client.ts');
  assert.match(migration, /FUNCTION public\.create_admin_cms_page[\s\S]*?public\.is_super_admin\(\)[\s\S]*?record_trusted_admin_action\('cms\.create'/);
  assert.match(migration, /FUNCTION public\.update_admin_cms_page[\s\S]*?public\.is_super_admin\(\)[\s\S]*?record_trusted_admin_action\('cms\.update'/);
  assert.match(page, /if \(pageForm\.is_published \|\| editingPage\?\.is_published\) setPendingPageSave\(true\)/);
  assert.match(page, /Confirm public page update/);
  assert.match(page, /Confirm page publication/);
  assert.match(page, /Confirm page unpublication/);
  assert.match(page, /\{pageForm\.content \|\| 'No page content'\}/);
  assert.match(page, /if \(!editingFaq \|\| editingFaq\.is_published\) setPendingFaqSave\(true\)/);
  assert.match(page, /Confirm FAQ publication/);
  assert.match(page, /Confirm public FAQ update/);
  assert.match(page, /\{faqForm\.question\}/);
  assert.match(page, /\{faqForm\.answer\}/);
  assert.match(page, /Review public FAQ/);
  assert.match(client, /rpc\('(?:create|update)_admin_cms_page'/);
  assert.match(client, /p_is_published: true/);
  assert.doesNotMatch(page, /onClick=\{handleSavePage\}/);
});

test('active announcements require publication confirmation while database scope remains authoritative', async () => {
  const migration = await read('supabase/migrations/20260911242000_0038_admin_authority_consolidation.sql');
  const reasonedMigration = await read('supabase/migrations/20260930150000_0103_reasoned_announcement_changes.sql');
  const scopedMigration = await read('supabase/migrations/20260930160000_0104_scoped_university_announcement_operations.sql');
  const page = await read('app/admin/announcements/page.tsx');
  const client = await read('lib/data/admin-client.ts');
  assert.match(migration, /FUNCTION public\.create_admin_announcement[\s\S]*public\.is_staff\(\)[\s\S]*public\.can_manage_university\(p_university_id\)/);
  assert.match(migration, /FUNCTION public\.update_admin_announcement[\s\S]*public\.is_staff\(\)[\s\S]*public\.can_manage_university\(p_university_id\)/);
  assert.match(page, /setPendingAnnouncementSave\(true\)/);
  assert.match(page, /Confirm announcement publication/);
  assert.match(page, /Confirm public announcement update/);
  assert.match(page, /Reason \(10–500 characters\)/);
  assert.match(page, /form\.reason\.trim\(\)\.length < 10/);
  assert.match(page, /\{form\.body\}/);
  assert.match(page, /getAdminUniversities\(\)/);
  assert.match(page, /aria-label="Select announcement university"/);
  assert.match(page, /Select the university for this announcement/);
  assert.match(page, /Scope: \{universities\.find/);
  assert.match(client, /rpc\('create_admin_announcement'/);
  assert.match(client, /rpc\('update_admin_announcement'/);
  assert.match(reasonedMigration, /DROP FUNCTION(?: IF EXISTS)? public\.create_admin_announcement/);
  assert.match(reasonedMigration, /DROP FUNCTION(?: IF EXISTS)? public\.update_admin_announcement/);
  assert.match(reasonedMigration, /clean_reason IS NULL OR length\(clean_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(reasonedMigration, /'reason', clean_reason/);
  assert.match(reasonedMigration, /p_university_id IS NOT NULL OR NOT public\.is_super_admin\(\)/);
  assert.match(reasonedMigration, /'prior_university_id', existing_university_id/);
  assert.match(scopedMigration, /FUNCTION public\.get_admin_announcements[\s\S]*role_name NOT IN \('super_admin', 'university_admin'\)[\s\S]*public\.can_manage_university\(a\.university_id\)/);
  assert.match(scopedMigration, /FUNCTION public\.record_trusted_university_announcement_action[\s\S]*current_app_role\(\) IS DISTINCT FROM 'university_admin'[\s\S]*can_manage_university\(p_university_id\)/);
  assert.match(scopedMigration, /FUNCTION public\.create_admin_announcement[\s\S]*role_name NOT IN \('super_admin', 'university_admin'\)/);
  assert.match(scopedMigration, /FUNCTION public\.update_admin_announcement[\s\S]*old_university_id IS NULL OR NOT public\.can_manage_university\(old_university_id\)/);
  assert.match(scopedMigration, /FUNCTION public\.delete_admin_announcement[\s\S]*target_university_id uuid[\s\S]*record_trusted_university_announcement_action\('announcement.delete'/);
  assert.match(client, /rpc\('get_admin_announcements'\)/);
  assert.doesNotMatch(client.match(/export async function getAdminAnnouncements\(\)[\s\S]*?\n}/)?.[0] || '', /\.from\('announcements'\)/);
  const adminLayout = await read('components/admin/admin-layout.tsx');
  assert.match(adminLayout, /item\.href === '\/admin\/announcements'/);
  assert.match(adminLayout, /pathname === '\/admin\/announcements'/);
  assert.match(client, /p_reason: data\.reason/);
  assert.doesNotMatch(page, /onClick=\{handleSave\}/);
});

test('management search is permission-aware and excludes restricted content', async () => {
  const migration = await read('supabase/migrations/20260929100000_0064_management_global_search.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const searchPage = await read('app/admin/search/page.tsx');
  const middleware = await read('lib/supabase/middleware.ts');
  const adminLayout = await read('components/admin/admin-layout.tsx');

  assert.match(migration, /search_management_records/);
  assert.match(migration, /v_role NOT IN \('super_admin', 'university_admin'\)/);
  assert.match(migration, /public\.can_manage_university\(v\.university_id\)/);
  assert.match(migration, /v_role='super_admin'/);
  assert.match(migration, /p_offset integer DEFAULT 0/);
  assert.match(migration, /v_offset < 0 OR v_offset > 10000/);
  assert.match(migration, /count\(\*\) OVER\(\) AS total_count/);
  assert.match(migration, /USING gin \(lower\(business_name\) gin_trgm_ops\)/);
  assert.match(migration, /USING gin \(lower\(email\) gin_trgm_ops\)/);
  assert.match(migration, /LIKE v_pattern ESCAPE E'\\\\'/);
  assert.doesNotMatch(migration, /position\(lower\(v_query\)/);
  assert.match(migration, /excludes private message/);
  assert.doesNotMatch(migration, /FROM public\.messages|FROM public\.payments|FROM public\.verification_documents/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.search_management_records\(text,integer,integer\)/);
  assert.match(adminClient, /rpc\('search_management_records'/);
  assert.match(adminClient, /p_offset: offset/);
  assert.match(searchPage, /window\.setTimeout/);
  assert.match(searchPage, /searchManagementRecords\(normalized, page \* pageSize, pageSize\)/);
  assert.match(searchPage, /Next search results/);
  assert.match(searchPage, /No authorized records match this search/);
  assert.match(middleware, /pathname === '\/admin\/search'/);
  assert.match(adminLayout, /pathname === '\/admin\/search'/);
  assert.match(adminLayout, /supabase\.rpc\('has_permission'/);
  assert.match(adminLayout, /moderatorPermissions\.has\('can_review_reports'\)/);
  assert.match(adminLayout, /moderatorPermissions\.has\('can_review_verifications'\)/);
  assert.match(adminLayout, /user\.role === 'super_admin'/);
  assert.match(middleware, /pathname === '\/admin\/businesses'/);
  assert.match(adminLayout, /href === '\/admin\/businesses'/);
});

test('catalogue and event management search results remain tenant-scoped and privacy-minimized', async () => {
  const migration = await read('supabase/migrations/20260930040000_0094_management_search_catalog_events.sql');
  const types = await read('lib/types/admin.ts');
  const page = await read('app/admin/search/page.tsx');
  const reader = migration.match(/CREATE OR REPLACE FUNCTION public\.search_management_records\([\s\S]*?\$\$;/);

  assert.ok(reader);
  for (const resource of ['business', 'product', 'service', 'event']) assert.match(reader[0], new RegExp(`'${resource}'::text`));
  assert.match(reader[0], /public\.can_manage_university\(COALESCE\(business\.university_id, vendor\.university_id\)\)/);
  assert.match(reader[0], /public\.can_manage_university\(COALESCE\(product\.university_id, business\.university_id, vendor\.university_id\)\)/);
  assert.match(reader[0], /public\.can_manage_university\(COALESCE\(service\.university_id, business\.university_id, vendor\.university_id\)\)/);
  assert.match(reader[0], /public\.can_manage_university\(event\.university_id\)/);
  assert.match(reader[0], /v_role = 'super_admin'[\s\S]*profile\.email/);
  assert.match(reader[0], /v_limit NOT BETWEEN 1 AND 50 OR v_offset < 0 OR v_offset > 10000/);
  assert.doesNotMatch(reader[0], /product\.price|service\.price|product\.stock|payment|message|verification_document|support_tickets/i);
  assert.match(migration, /businesses_management_name_trgm_idx[\s\S]*gin_trgm_ops/);
  assert.match(migration, /products_management_name_trgm_idx[\s\S]*gin_trgm_ops/);
  assert.match(migration, /services_management_name_trgm_idx[\s\S]*gin_trgm_ops/);
  assert.match(migration, /events_management_title_trgm_idx[\s\S]*gin_trgm_ops/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.search_management_records\(text,integer,integer\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(types, /resource_type: 'vendor' \| 'order' \| 'university' \| 'user' \| 'business' \| 'product' \| 'service' \| 'event'/);
  assert.match(page, /event: '\/admin\/events'/);
  assert.match(page, /product: '\/admin\/businesses'/);
  assert.match(page, /products, services, events/);
});

test('operational alerts derive real counts in SQL with role-specific scope and no sensitive rows', async () => {
  const migration = await read('supabase/migrations/20260930050000_0095_management_operational_alerts.sql');
  const client = await read('lib/data/admin-client.ts');
  const types = await read('lib/types/admin.ts');
  const page = await read('app/admin/page.tsx');
  const reader = migration.match(/CREATE OR REPLACE FUNCTION public\.get_admin_operational_alerts\(\)[\s\S]*?\$\$;/);

  assert.ok(reader);
  assert.match(reader[0], /v_role NOT IN \('super_admin', 'university_admin', 'moderator'\)/);
  assert.match(reader[0], /public\.has_permission\('can_manage_communications'\)/);
  assert.match(reader[0], /public\.has_permission\('can_manage_support'\)/);
  assert.match(reader[0], /public\.has_permission\('can_review_reports'\)/);
  assert.match(reader[0], /public\.has_permission\('can_review_verifications'\)/);
  assert.match(reader[0], /v_role = 'super_admin' AND payment\.status = 'reconciliation_required'/);
  assert.match(reader[0], /public\.can_manage_university\(vendor\.university_id\)/);
  assert.match(reader[0], /public\.can_manage_university\(COALESCE\(product\.university_id, business\.university_id, vendor\.university_id\)\)/);
  assert.match(reader[0], /delivery\.created_at >= now\(\) - interval '24 hours'/);
  assert.match(reader[0], /vendor\.created_at < now\(\) - interval '72 hours'/);
  assert.match(reader[0], /HAVING count\(\*\) > 0/);
  assert.doesNotMatch(reader[0], /provider_reference|webhook_data|failure_reason|ticket\.subject|ticket\.description|report\.reason|product\.name|product\.price/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_operational_alerts\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(client, /rpc\('get_admin_operational_alerts'/);
  assert.match(types, /export interface AdminOperationalAlert/);
  assert.match(page, /function OperationalAlertsPanel/);
  assert.match(page, /No operational alerts right now/);
  assert.match(page, /Operational alerts/);
  assert.match(page, /role="alert"/);
  assert.match(page, /payment_reconciliation: '\/admin\/payments'/);
});

test('moderators get an operations home only through server-verified permissions', async () => {
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const dashboard = await read('app/admin/page.tsx');
  const migration = await read('supabase/migrations/20260930060000_0096_moderator_operations_overview.sql');
  const alerts = migration.match(/CREATE OR REPLACE FUNCTION public\.get_admin_operational_alerts\(\)[\s\S]*?\$\$;/);

  assert.ok(alerts);
  assert.match(middleware, /role === 'moderator' && pathname === '\/admin' && !error[\s\S]*overviewPermissions[\s\S]*has_permission/);
  assert.match(middleware, /permissionResults\.some\(result => !result\.error && result\.data === true\)/);
  assert.match(layout, /item\.href === '\/admin' && moderatorPermissions\.size > 0/);
  assert.match(dashboard, /user\?\.role === 'moderator'[\s\S]*kind: 'operations'/);
  assert.match(dashboard, /function OperationalAlertsPanel/);
  assert.match(alerts[0], /public\.has_permission\('can_moderate_content'\)/);
  assert.match(alerts[0], /'content_reviews'/);
  assert.match(alerts[0], /'pending_advertisements'/);
  assert.match(alerts[0], /v_role = 'super_admin' AND payment\.status = 'reconciliation_required'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_operational_alerts\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
});

test('support operations require the assigned support capability and expose failures without browser export', async () => {
  const migration = await read('supabase/migrations/20260929140000_0068_moderator_operational_permissions.sql');
  const assignmentMigration = await read('supabase/migrations/20260930010000_0088_admin_support_assignment_workflow.sql');
  const closeMigration = await read('supabase/migrations/20260930120000_0100_reasoned_support_ticket_closure.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const supportPage = await read('app/admin/support/page.tsx');
  const middleware = await read('lib/supabase/middleware.ts');
  const adminLayout = await read('components/admin/admin-layout.tsx');

  for (const procedure of ['get_admin_support_tickets', 'get_admin_support_ticket_detail', 'get_admin_support_ticket_replies']) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${procedure}[\\s\\S]*?public\\.has_permission\\('can_manage_support'\\)`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${procedure}`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION[\\s\\S]*TO authenticated`));
  }
  for (const procedure of ['add_admin_ticket_reply', 'assign_admin_support_ticket', 'close_admin_support_ticket']) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${procedure}[\\s\\S]*?public\\.has_permission\\('can_manage_support'\\)`));
  }
  assert.match(migration, /FUNCTION public\.resolve_admin_report[\s\S]*public\.has_permission\('can_review_reports'\)/);
  assert.match(migration, /CREATE POLICY reports_owner_read[\s\S]*public\.has_permission\('can_review_reports'\)/);
  assert.match(migration, /CREATE POLICY support_tickets_owner_read[\s\S]*public\.has_permission\('can_manage_support'\)/);
  assert.match(migration, /CREATE POLICY ticket_replies_owner_read[\s\S]*public\.has_permission\('can_manage_support'\)/);
  assert.match(migration, /author_id uuid, author_full_name text/);

  const listReader = adminClient.match(/export async function getAdminTickets[\s\S]*?\n}\n/);
  const detailReader = adminClient.match(/export async function getTicketById[\s\S]*?\n}\n/);
  const repliesReader = adminClient.match(/export async function getTicketReplies[\s\S]*?\n}\n/);
  assert.ok(listReader && detailReader && repliesReader);
  assert.match(listReader[0], /rpc\('get_admin_support_tickets'/);
  assert.match(listReader[0], /ok: false, error:/);
  assert.match(detailReader[0], /rpc\('get_admin_support_ticket_detail'/);
  assert.match(detailReader[0], /throw new Error/);
  assert.match(repliesReader[0], /rpc\('get_admin_support_ticket_replies'/);
  assert.match(repliesReader[0], /ok: false, error:/);
  assert.doesNotMatch(adminClient, /from\('support_tickets'\)[\s\S]{0,500}?\.(?:update|upsert|delete)\(/);
  assert.match(adminClient, /rpc\('add_admin_ticket_reply'/);
  assert.match(adminClient, /rpc\('assign_admin_support_ticket'/);
  assert.match(adminClient, /rpc\('close_admin_support_ticket'/);
  assert.match(assignmentMigration, /FUNCTION public\.get_admin_support_assignees[\s\S]*public\.has_permission\('can_manage_support'\)/);
  assert.match(assignmentMigration, /REVOKE ALL ON FUNCTION public\.assign_admin_support_ticket\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(assignmentMigration, /FUNCTION public\.assign_admin_support_ticket\([\s\S]*p_assignee_id uuid,[\s\S]*p_reason text/);
  assert.match(assignmentMigration, /length\(v_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(assignmentMigration, /FROM public\.support_tickets\s+WHERE id=p_ticket_id FOR UPDATE/);
  assert.match(assignmentMigration, /'previous_assignee_id',v_previous_assignee/);
  assert.match(assignmentMigration, /'reason',v_reason/);
  assert.match(closeMigration, /FUNCTION public\.close_admin_support_ticket\(p_ticket_id uuid, p_reason text\)/);
  assert.match(closeMigration, /length\(v_reason\) NOT BETWEEN 10 AND 1000/);
  assert.match(closeMigration, /jsonb_build_object\('reason',v_reason\)/);
  assert.match(closeMigration, /REVOKE ALL ON FUNCTION public\.close_admin_support_ticket\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(closeMigration, /GRANT EXECUTE ON FUNCTION public\.close_admin_support_ticket\(uuid,text\) TO authenticated/);
  assert.match(adminClient, /rpc\('get_admin_support_assignees'/);
  assert.match(adminClient, /p_assignee_id: assigneeId,[\s\S]*p_reason: reason/);
  const assignmentWriter = adminClient.match(/export async function assignTicket[\s\S]*?\n}\n/);
  const replyWriter = adminClient.match(/export async function replyToTicket[\s\S]*?\n}\n/);
  const closeWriter = adminClient.match(/export async function closeTicket[\s\S]*?\n}\n/);
  assert.ok(assignmentWriter && replyWriter && closeWriter);
  for (const writer of [assignmentWriter[0], replyWriter[0], closeWriter[0]]) assert.doesNotMatch(writer, /error\?\.message/);
  assert.match(supportPage, /aria-label="Assignment reason"/);
  assert.match(supportPage, /Assign support ticket/);
  assert.match(supportPage, /setAssignmentConfirmationOpen\(true\)/);
  assert.match(supportPage, /Confirm ticket assignment/);
  assert.match(supportPage, /Reason: \{assignmentReason\.trim\(\)\}/);
  assert.doesNotMatch(supportPage, /onClick=\{\(\) => void handleAssign\(\)\}/);
  assert.match(supportPage, /aria-label="Ticket closure reason"/);
  assert.match(supportPage, /closeTicket\(selected\.id, closeReason\.trim\(\)\)/);
  assert.match(adminClient, /close_admin_support_ticket', \{ p_ticket_id: ticketId, p_reason: reason\.trim\(\) \}/);
  assert.match(middleware, /'can_manage_support'/);
  assert.match(adminLayout, /moderatorPermissions\.has\('can_manage_support'\)/);

  assert.match(supportPage, /result\.ok/);
  assert.match(supportPage, /Unable to load support tickets/);
  assert.match(supportPage, /Retry/);
  assert.match(supportPage, /Unable to load ticket details/);
  assert.match(supportPage, /Retry replies/);
  assert.doesNotMatch(supportPage, /exportToCsv|handleExport|Download/);
});

test('moderator permissions are edited only by super admins through a reasoned audited RPC', async () => {
  const migration = await read('supabase/migrations/20260929140000_0068_moderator_operational_permissions.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const rolesPage = await read('app/admin/roles/page.tsx');
  const moderationPage = await read('app/admin/moderation/page.tsx');

  assert.match(migration, /get_admin_role_permissions\(\)[\s\S]*?NOT public\.is_super_admin\(\)/);
  assert.match(migration, /update_admin_moderator_permissions\([\s\S]*?NOT public\.is_super_admin\(\)/);
  assert.match(migration, /length\(btrim\(p_reason\)\) < 10/);
  assert.match(migration, /v_allowed constant text\[\] := ARRAY\['can_review_reports','can_review_verifications','can_manage_support'\]/);
  assert.match(migration, /record_trusted_admin_action\([\s\S]*'moderator\.permissions_updated'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.update_admin_moderator_permissions\(text\[\],text\)/);
  assert.match(adminClient, /rpc\('get_admin_role_permissions'\)/);
  assert.match(adminClient, /rpc\('update_admin_moderator_permissions'/);
  assert.doesNotMatch(adminClient, /from\('role_permissions'\)/);
  assert.match(rolesPage, /Save moderator permissions/);
  assert.match(rolesPage, /required, at least 10 characters/);
  assert.match(moderationPage, /note\.trim\(\)\.length < 10/);
  assert.match(moderationPage, /Unable to load reports/);
  assert.match(moderationPage, /Retry/);
  assert.match(adminClient, /if \(error\) throw new Error\('Unable to load reports'\)/);
});

test('CMS, announcements, and broadcasts distinguish read failures from empty results', async () => {
  const adminClient = await read('lib/data/admin-client.ts');
  const communications = await read('lib/data/communication-client.ts');
  const cmsPage = await read('app/admin/cms/page.tsx');
  const announcementsPage = await read('app/admin/announcements/page.tsx');
  const broadcastsPage = await read('app/admin/broadcasts/page.tsx');

  assert.match(adminClient, /if \(error\) throw new Error\('Unable to load CMS pages'\)/);
  assert.match(adminClient, /if \(error\) throw new Error\('Unable to load FAQ entries'\)/);
  assert.match(adminClient, /if \(error\) throw new Error\('Unable to load announcements'\)/);
  assert.match(communications, /if \(error\) throw new Error\('Unable to load broadcasts'\)/);
  for (const page of [cmsPage, announcementsPage, broadcastsPage]) {
    assert.match(page, /loadError/);
    assert.match(page, /Unable to load/);
    assert.match(page, />Retry</);
  }
});

test('business directory is database-scoped for university admins and hides platform actions', async () => {
  const migration = await read('supabase/migrations/20260929120000_0066_admin_vendor_directory.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const businessPage = await read('app/admin/businesses/page.tsx');

  assert.match(migration, /current_app_role\(\)/);
  assert.match(migration, /v_role IS NULL OR v_role NOT IN \('super_admin', 'university_admin'\)/);
  assert.match(migration, /public\.can_manage_university\(v\.university_id\)/);
  assert.match(migration, /CASE WHEN v_role = 'super_admin' THEN owner\.email ELSE NULL END/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_business_directory/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_admin_business_directory[\s\S]*TO authenticated/);
  const reader = adminClient.match(/export async function getAdminBusinesses[\s\S]*?\n}\n/);
  assert.ok(reader);
  assert.match(reader[0], /rpc\('get_admin_business_directory'/);
  assert.doesNotMatch(reader[0], /from\('vendors'\)/);
  assert.match(businessPage, /canManageVendors && <div className="flex gap-2"/);
  assert.doesNotMatch(businessPage, /exportToCsv|handleExport|Download/);
  assert.match(businessPage, /actionReason\.trim\(\)\.length < 10/);
  assert.match(businessPage, /requestAction\('verify'\)/);
  assert.match(businessPage, /requestAction\('suspend'\)/);
  assert.match(businessPage, /Confirm business/);
  assert.match(businessPage, /void confirmAction\(\)/);
  assert.doesNotMatch(businessPage, /Suspended by admin/);
  assert.match(businessPage, /Unable to load businesses within your management scope/);
});

test('university branding writes remain tenant-scoped and receive narrow trusted audit records', async () => {
  const migration = await read('supabase/migrations/20260929130000_0067_university_admin_branding_audit.sql');
  const client = await read('lib/data/admin-client.ts');
  const universitiesPage = await read('app/admin/universities/page.tsx');
  const baseAuthority = await read('supabase/migrations/20260911242000_0038_admin_authority_consolidation.sql');

  assert.match(migration, /current_app_role\(\) IS DISTINCT FROM 'university_admin'/);
  assert.match(migration, /NOT public\.can_manage_university\(p_university_id\)/);
  assert.match(migration, /p_action NOT IN \('university\.branding_set', 'university\.branding_removed', 'university\.branding_metadata_updated'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_trusted_university_admin_action[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /update_admin_university_branding_metadata/);
  assert.match(migration, /length\(COALESCE\(p_logo_alt_text, ''\)\) > 300/);
  assert.match(migration, /FROM storage\.objects WHERE bucket_id = 'university-branding' AND name = p_object_path/);
  assert.match(migration, /CASE WHEN p_object_path IS NULL THEN 'university\.branding_removed' ELSE 'university\.branding_set' END/);
  assert.match(baseAuthority, /IF auth\.uid\(\) IS NULL OR NOT public\.is_staff\(\)/);
  assert.match(client, /rpc\('update_admin_university_branding_metadata'/);
  assert.match(universitiesPage, /updateUniversityBrandingMetadata\(editing\.id/);
  assert.match(universitiesPage, /Save branding details/);
});

test('admin catalog reads fail visibly and coupon configuration stays database-authoritative', async () => {
  const migration = await read('supabase/migrations/20260929150000_0069_admin_coupon_and_category_authority.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const paymentClient = await read('lib/data/payment-client.ts');
  const couponPage = await read('app/admin/coupons/page.tsx');
  const categoryPage = await read('app/admin/categories/page.tsx');

  assert.match(migration, /get_admin_category_directory[\s\S]*?NOT public\.is_super_admin\(\)/);
  assert.match(migration, /get_admin_coupons[\s\S]*?NOT public\.is_super_admin\(\)/);
  assert.match(migration, /DROP POLICY IF EXISTS super_admin_insert_coupons/);
  assert.match(migration, /DROP POLICY IF EXISTS super_admin_update_coupons/);
  assert.match(migration, /DROP POLICY IF EXISTS super_admin_delete_coupons/);
  assert.match(migration, /REVOKE INSERT,UPDATE,DELETE ON public\.coupons FROM authenticated/);
  assert.match(migration, /admin_create_coupon[\s\S]*?record_trusted_admin_action\([\s\S]*'coupon\.created'/);
  assert.match(migration, /admin_update_coupon[\s\S]*?record_trusted_admin_action\([\s\S]*'coupon\.updated'/);
  assert.match(migration, /Usage limit cannot be lower than recorded redemptions/);
  assert.doesNotMatch(migration.match(/UPDATE public\.coupons SET[\s\S]*?WHERE id=p_coupon_id/)?.[0] || '', /usage_count\s*=/);
  assert.match(adminClient, /rpc\('get_admin_category_directory'/);
  assert.doesNotMatch(adminClient.match(/export async function getAdminCategories[\s\S]*?\n}\n/)?.[0] || '', /from\('categories'\)/);
  assert.match(paymentClient, /rpc\('get_admin_coupons'/);
  assert.match(paymentClient, /rpc\('admin_create_coupon'/);
  assert.match(paymentClient, /rpc\('admin_update_coupon'/);
  assert.doesNotMatch(paymentClient, /from\('coupons'\)\.(insert|update|delete)/);
  assert.doesNotMatch(paymentClient, /function deleteCoupon/);
  assert.doesNotMatch(couponPage, /deleteCoupon|handleDelete|Trash2/);
  assert.match(couponPage, /reason\.trim\(\)\.length < 10/);
  assert.match(couponPage, /Usage Limit \(0 = unlimited\)/);
  for (const page of [couponPage, categoryPage]) {
    assert.match(page, /loadError/);
    assert.match(page, />Retry</);
  }
});

test('destructive category, CMS, FAQ, and announcement actions require audited reasons', async () => {
  const migration = await read('supabase/migrations/20260930110000_0099_reasoned_content_deletions.sql');
  const client = await read('lib/data/admin-client.ts');
  const component = await read('components/admin/admin-delete-confirmation.tsx');
  const pages = [
    await read('app/admin/categories/page.tsx'),
    await read('app/admin/cms/page.tsx'),
    await read('app/admin/announcements/page.tsx'),
  ];
  const resources = ['category', 'cms_page', 'faq', 'announcement'];

  for (const resource of resources) {
    assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.delete_admin_${resource}\\([^)]*p_reason text\\)`));
  }
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.delete_admin_category\(uuid\),\s*public\.delete_admin_cms_page\(uuid\),\s*public\.delete_admin_faq\(uuid\),\s*public\.delete_admin_announcement\(uuid\)/);
  assert.match(migration, /clean_reason IS NULL OR length\(clean_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(migration, /public\.record_trusted_admin_action\('category\.delete'[\s\S]*'reason', clean_reason/);
  assert.match(migration, /public\.record_trusted_admin_action\('cms\.delete'[\s\S]*'reason', clean_reason/);
  assert.match(migration, /public\.record_trusted_admin_action\('faq\.delete'[\s\S]*'reason', clean_reason/);
  assert.match(migration, /public\.can_manage_university\(university_id\)/);
  assert.match(migration, /public\.record_trusted_admin_action\('announcement\.delete'[\s\S]*'reason', clean_reason/);
  for (const fn of ['deleteCategory', 'deleteCmsPage', 'deleteFaqEntry', 'deleteAnnouncement']) {
    assert.match(client, new RegExp(`function ${fn}\\(id: string, reason: string\\)`));
    assert.match(client.match(new RegExp(`export async function ${fn}[\\s\\S]*?\\n}\\n`))?.[0] || '', /p_reason: reason/);
  }
  assert.match(component, /AlertDialog/);
  assert.match(component, /reason\.trim\(\)\.length < 10/);
  assert.match(component, /onConfirm\(normalizedReason\)/);
  for (const page of pages) {
    assert.match(page, /AdminDeleteConfirmation/);
    assert.doesNotMatch(page, /window\.confirm|\bconfirm\(/);
  }
});

test('subscription operations use a bounded super-admin read model and audited server export', async () => {
  const migration = await read('supabase/migrations/20260929160000_0070_admin_subscription_operations.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const page = await read('app/admin/subscriptions/page.tsx');
  const route = await read('app/api/admin/subscriptions/export/route.ts');
  const reader = adminClient.match(/export async function getAdminSubscriptions[\s\S]*?\n}\n/);

  assert.match(migration, /get_admin_subscription_directory[\s\S]*?NOT public\.is_super_admin\(\)/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0/);
  assert.match(migration, /export_admin_subscriptions[\s\S]*?NOT public\.is_super_admin\(\)/);
  assert.match(migration, /v_count > 5000/);
  assert.match(migration, /record_trusted_admin_action\([\s\S]*'subscriptions\.export'/);
  assert.doesNotMatch(migration, /payment_reference|provider_reference|owner_id|extension_note/);
  assert.ok(reader);
  assert.match(reader[0], /rpc\('get_admin_subscription_directory'/);
  assert.doesNotMatch(reader[0], /from\('subscriptions'\)/);
  const csvHelper = await read('lib/server/admin-csv-export.ts');
  assert.match(route, /handleAdminCsvExport/);
  assert.match(csvHelper, /request\.headers\.get\('origin'\) !== request\.nextUrl\.origin/);
  assert.match(csvHelper, /supabase\.auth\.getUser\(\)/);
  assert.match(csvHelper, /MAX_EXPORT_REQUEST_BYTES = 1024/);
  assert.match(csvHelper, /totalBytes > MAX_EXPORT_REQUEST_BYTES/);
  assert.match(csvHelper, /request\.body\.getReader\(\)/);
  assert.doesNotMatch(csvHelper, /request\.json\(\)/);
  assert.match(csvHelper, /'X-Robots-Tag': 'noindex, nofollow, noarchive'/);
  const exportHandler = csvHelper.match(/export async function handleAdminCsvExport\([\s\S]*$/)?.[0];
  assert.ok(exportHandler);
  assert.ok(exportHandler.indexOf("supabase.auth.getUser()") < exportHandler.indexOf('readLimitedJson(request)'), 'authentication happens before reading the body');
  assert.match(csvHelper, /rpc\(options\.rpcName/);
  assert.match(csvHelper, /Cache-Control': 'private, no-store, max-age=0/);
  assert.match(csvHelper, /safeText\.replace/);
  assert.match(csvHelper, /nosniff/);
  assert.match(page, /downloadAdminCsv\('subscriptions', filter\)/);
  assert.doesNotMatch(page, /exportToCsv|s\.payment_reference|s\.provider_reference/);
  assert.match(page, /Unable to load subscriptions\. Please retry\./);
  assert.match(page, />Retry</);
});

test('payment and invoice administration use narrow authorized readers and server-audited exports', async () => {
  const migration = await read('supabase/migrations/20260929170000_0071_admin_payment_invoice_operations.sql');
  const paymentClient = await read('lib/data/payment-client.ts');
  const paymentPage = await read('app/admin/payments/page.tsx');
  const invoicePage = await read('app/admin/invoices/page.tsx');
  const csvHelper = await read('lib/server/admin-csv-export.ts');
  const paymentRoute = await read('app/api/admin/payments/export/route.ts');
  const invoiceRoute = await read('app/api/admin/invoices/export/route.ts');
  const paymentReader = paymentClient.match(/export async function getAdminPayments[\s\S]*?\n}\n/);
  const invoiceReader = paymentClient.match(/export async function getAdminInvoices[\s\S]*?\n}\n/);

  assert.match(migration, /DROP POLICY IF EXISTS staff_select_all_payments ON public\.payments/);
  assert.match(migration, /CREATE POLICY super_admin_select_all_payments[\s\S]*public\.is_super_admin\(\)/);
  assert.match(migration, /DROP POLICY IF EXISTS staff_select_all_payment_history ON public\.payment_status_history/);
  assert.match(migration, /DROP POLICY IF EXISTS staff_select_tx_audit ON public\.transaction_audit_log/);
  assert.match(migration, /DROP POLICY IF EXISTS staff_select_redemptions ON public\.coupon_redemptions/);
  assert.match(migration, /CREATE POLICY super_admin_select_coupon_redemptions[\s\S]*public\.is_super_admin\(\)/);
  for (const rpc of ['get_admin_payment_directory','export_admin_payments','get_admin_invoice_directory','export_admin_invoices']) {
    const functionBody = migration.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\([\\s\\S]*?\\$\\$;`));
    assert.ok(functionBody, `${rpc} function exists`);
    assert.match(functionBody[0], /NOT public\.is_super_admin\(\)/);
  }
  assert.match(migration, /record_trusted_admin_action\([\s\S]*'payments\.export'/);
  assert.match(migration, /record_trusted_admin_action\([\s\S]*'invoices\.export'/);
  assert.match(migration, /v_count > 5000/);
  assert.doesNotMatch(migration, /webhook_data|provider_reference|mobile_number|failure_reason|billing_phone|billing_email|invoice\.metadata|invoice\.notes/);
  assert.ok(paymentReader);
  assert.match(paymentReader[0], /rpc\('get_admin_payment_directory'/);
  assert.doesNotMatch(paymentReader[0], /from\('payments'\)/);
  assert.ok(invoiceReader);
  assert.match(invoiceReader[0], /rpc\('get_admin_invoice_directory'/);
  assert.doesNotMatch(invoiceReader[0], /from\('invoices'\)/);
  assert.match(csvHelper, /request\.headers\.get\('origin'\) !== request\.nextUrl\.origin/);
  assert.match(csvHelper, /supabase\.auth\.getUser\(\)/);
  assert.match(csvHelper, /options\.allowedStatuses\.has/);
  assert.match(csvHelper, /rpc\(options\.rpcName/);
  assert.match(csvHelper, /5,000-record limit/);
  assert.match(csvHelper, /private, no-store/);
  assert.match(csvHelper, /nosniff/);
  assert.match(csvHelper, /safeText\.replace/);
  assert.match(paymentRoute, /export_admin_payments/);
  assert.match(invoiceRoute, /export_admin_invoices/);
  for (const page of [paymentPage, invoicePage]) {
    assert.doesNotMatch(page, /exportToCsv/);
    assert.match(page, /downloadAdminCsv/);
    assert.match(page, /loadError/);
    assert.match(page, />Retry</);
  }
});

test('refund queue is super-admin-only, decisions require an audit reason, and unsupported processing is absent', async () => {
  const migration = await read('supabase/migrations/20260929180000_0072_admin_refund_operations.sql');
  const paymentClient = await read('lib/data/payment-client.ts');
  const page = await read('app/admin/refunds/page.tsx');
  const reader = paymentClient.match(/export async function getAdminRefunds[\s\S]*?\n}\n/);
  const reviewer = migration.match(/CREATE OR REPLACE FUNCTION public\.review_payment_refund[\s\S]*?\$\$;/);

  assert.match(migration, /get_admin_refund_directory[\s\S]*NOT public\.is_super_admin\(\)/);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0/);
  assert.ok(reviewer);
  assert.match(reviewer[0], /NOT public\.is_super_admin\(\)/);
  assert.match(reviewer[0], /p_approved IS NULL/);
  assert.match(reviewer[0], /length\(v_note\) < 10 OR length\(v_note\) > 500/);
  assert.match(reviewer[0], /refund_row\.status <> 'requested'/);
  assert.match(reviewer[0], /record_trusted_admin_action\([\s\S]*'refund\.'/);
  assert.match(reviewer[0], /transaction_audit_log/);
  assert.doesNotMatch(migration, /provider_reference\s*=/);
  assert.ok(reader);
  assert.match(reader[0], /rpc\('get_admin_refund_directory'/);
  assert.doesNotMatch(reader[0], /from\('refunds'\)/);
  assert.match(paymentClient, /Unable to approve this refund/);
  assert.match(paymentClient, /Unable to reject this refund/);
  assert.doesNotMatch(paymentClient, /function processRefund/);
  assert.match(page, /loadError/);
  assert.match(page, /Unable to load refunds\. Please retry\./);
  assert.match(page, />Retry</);
  assert.match(page, /review reason \(required, at least 10 characters\)/i);
  assert.match(page, /Awaiting provider workflow/);
  assert.doesNotMatch(page, /processRefund|providerRef|Process Refund|set.*processed/i);
});

test('student verification reads omit private paths and documents use authorized short-lived signing', async () => {
  const migration = await read('supabase/migrations/20260929190000_0073_student_verification_document_access.sql');
  const reasonedDecisionMigration = await read('supabase/migrations/20260930100000_0098_require_reason_student_verification_decisions.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const page = await read('app/admin/verification/students/page.tsx');
  const signer = await read('supabase/functions/get-student-verification-document-url/index.ts');
  const config = await read('supabase/config.toml');
  const reader = adminClient.match(/export async function getStudentVerifications[\s\S]*?\n}\n/);
  const authorizer = migration.match(/CREATE OR REPLACE FUNCTION public\.authorize_student_verification_document_access[\s\S]*?\$\$;/);
  const reviewer = migration.match(/CREATE OR REPLACE FUNCTION public\.review_student_verification[\s\S]*?\$\$;/);

  assert.match(migration, /get_admin_student_verification_queue[\s\S]*public\.has_permission\('can_review_verifications'\)/);
  assert.match(migration, /student_id_document_url IS NOT NULL/);
  assert.ok(reader);
  assert.match(reader[0], /rpc\('get_admin_student_verification_queue'/);
  assert.doesNotMatch(reader[0], /from\('student_profiles'\)|student_id_document_url/);
  assert.ok(authorizer);
  assert.match(authorizer[0], /auth\.uid\(\) <> v_owner_id/);
  assert.match(authorizer[0], /can_manage_university\(v_university_id\)/);
  assert.match(authorizer[0], /student-documents/);
  assert.match(authorizer[0], /storage\.objects/);
  assert.match(authorizer[0], /v_path !~\*/);
  assert.ok(reviewer);
  assert.match(reviewer[0], /p_approved IS NULL/);
  assert.match(reviewer[0], /length\(clean_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(reviewer[0], /auth\.uid\(\)/);
  assert.match(reviewer[0], /INSERT INTO public\.audit_logs/);
  assert.match(migration, /v_role <> 'university_admin'[\s\S]*can_manage_university\(COALESCE\(student\.university_id, profile\.university_id\)\)/);
  assert.match(migration, /Student verification is outside your university scope/);
  assert.match(await read('lib/supabase/middleware.ts'), /pathname === '\/admin\/verification\/students'/);
  assert.match(signer, /caller\.auth\.getUser\(\)/);
  assert.match(signer, /authorize_student_verification_document_access/);
  assert.match(signer, /bucket_id !== 'student-documents'/);
  assert.match(signer, /createSignedUrl\(authorizedDocument\.object_path, URL_TTL_SECONDS\)/);
  assert.match(signer, /private, no-store/);
  assert.doesNotMatch(signer, /getPublicUrl/);
  assert.match(config, /\[functions\.get-student-verification-document-url\][\s\S]*verify_jwt = true/);
  assert.match(adminClient, /\/storage\/v1\/object\/sign\/student-documents\//);
  assert.match(page, /Prepare secure link/);
  assert.match(page, /expires in 5 minutes/);
  assert.doesNotMatch(page, /student_id_document_url/);
  assert.match(page, /reason\.trim\(\)\.length < 10/);
  assert.match(reasonedDecisionMigration, /clean_reason IS NULL OR length\(clean_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(reasonedDecisionMigration, /INSERT INTO public\.audit_logs[\s\S]*jsonb_build_object\('reason', clean_reason/);
  assert.match(reasonedDecisionMigration, /auth\.uid\(\) IS NULL/);
  assert.match(reasonedDecisionMigration, /FOR UPDATE/);
  assert.match(reasonedDecisionMigration, /public\.can_manage_university\(target_university_id\)/);
  assert.match(reasonedDecisionMigration, /public\.has_permission\('can_review_verifications'\)/);
  assert.match(reasonedDecisionMigration, /GRANT EXECUTE ON FUNCTION public\.review_student_verification\(uuid, boolean, text\) TO authenticated/);
  assert.match(page, /pendingDecision/);
  assert.match(page, /requestDecision\('approve'\)/);
  assert.match(page, /requestDecision\('reject'\)/);
  assert.match(page, /approveStudentVerification\(selected\.id, reason\.trim\(\)\)/);
  assert.match(page, /rejectStudentVerification\(selected\.id, reason\.trim\(\)\)/);
  assert.match(page, /Confirm student verification/);
  assert.doesNotMatch(page, /onClick=\{handleReject\}|onClick=\{handleApprove\}/);
});

test('content moderation uses an assigned database capability across UI, middleware, and RLS', async () => {
  const migration = await read('supabase/migrations/20260929200000_0074_assigned_content_moderation.sql');
  const rolesPage = await read('app/admin/roles/page.tsx');
  const layout = await read('components/admin/admin-layout.tsx');
  const middleware = await read('lib/supabase/middleware.ts');
  const adsPage = await read('app/admin/advertisements/page.tsx');

  assert.match(migration, /public\.is_super_admin\(\) OR public\.has_permission\('can_moderate_content'\)/);
  assert.match(migration, /v_allowed constant text\[\].*'can_moderate_content'/);
  assert.match(migration, /DROP POLICY IF EXISTS advertisements_staff_read/);
  assert.match(migration, /advertisements_assigned_moderator_read[\s\S]*public\.has_permission\('can_moderate_content'\)/);
  assert.match(migration, /review_moderation_assigned_read[\s\S]*public\.has_permission\('can_moderate_content'\)/);
  assert.match(migration, /length\(v_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(rolesPage, /'can_moderate_content'/);
  assert.match(layout, /item\.href === '\/admin\/advertisements' && moderatorPermissions\.has\('can_moderate_content'\)/);
  assert.match(middleware, /'can_moderate_content'/);
  assert.match(adsPage, /reason\.trim\(\)\.length < 10/);
  assert.match(adsPage, /min=\{0\} max=\{100\}/);
  assert.doesNotMatch(adsPage, /text-muted-foreground\\\"/);
});

test('university-admin directory updates retain tenant scope and use scoped audit records', async () => {
  const migration = await read('supabase/migrations/20260929210000_0075_scoped_university_update_audit.sql');
  const updater = migration.match(/CREATE OR REPLACE FUNCTION public\.update_admin_university\([\s\S]*?\$\$;/);
  const logger = migration.match(/CREATE OR REPLACE FUNCTION public\.record_trusted_university_admin_action\([\s\S]*?\$\$;/);

  assert.ok(updater);
  assert.ok(logger);
  assert.match(updater[0], /public\.can_manage_university\(p_university_id\)/);
  assert.match(updater[0], /public\.current_app_role\(\) = 'university_admin'[\s\S]*record_trusted_university_admin_action/);
  assert.match(updater[0], /ELSE[\s\S]*record_trusted_admin_action/);
  assert.match(logger[0], /current_app_role\(\) IS DISTINCT FROM 'university_admin'/);
  assert.match(logger[0], /can_manage_university\(p_university_id\)/);
  assert.match(logger[0], /'university\.update'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.update_admin_university/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.update_admin_university[\s\S]*TO authenticated/);
});

test('review center uses a bounded privacy-minimized queue and existing audited moderation authority', async () => {
  const migration = await read('supabase/migrations/20260929220000_0076_admin_review_moderation_queue.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const page = await read('app/admin/reviews/page.tsx');
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const queue = migration.match(/CREATE OR REPLACE FUNCTION public\.get_admin_review_moderation_queue\([\s\S]*?\$\$;/);
  const reader = adminClient.match(/export async function getAdminReviewQueue\([\s\S]*?\n}\n/);
  const moderator = adminClient.match(/export async function moderateAdminReview\([\s\S]*?\n}\n/);

  assert.ok(queue);
  assert.match(queue[0], /is_super_admin\(\) OR public\.has_permission\('can_moderate_content'\)/);
  assert.match(queue[0], /v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 10000/);
  assert.match(queue[0], /position\(v_search IN lower\(/);
  assert.match(queue[0], /moderation_status text/);
  assert.match(queue[0], /count\(\*\) OVER \(\)/);
  assert.doesNotMatch(queue[0], /reviewer_id|reviewer_email|profiles/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_review_moderation_queue[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.ok(reader);
  assert.match(reader[0], /rpc\('get_admin_review_moderation_queue'/);
  assert.doesNotMatch(reader[0], /from\('reviews'\)/);
  assert.ok(moderator);
  assert.match(moderator[0], /rpc\('moderate_admin_review'/);
  assert.match(page, /reason\.trim\(\)\.length < 10/);
  assert.match(page, /Confirm review moderation/);
  assert.match(page, /requestVersion/);
  assert.match(page, /getAdminReviewQueue/);
  assert.match(middleware, /pathname === '\/admin\/reviews'[\s\S]*'can_moderate_content'/);
  assert.match(layout, /item\.href === '\/admin\/reviews' && moderatorPermissions\.has\('can_moderate_content'\)/);
});

test('student directory derives university scope and returns only minimized operational summaries', async () => {
  const migration = await read('supabase/migrations/20260929230000_0077_admin_student_directory.sql');
  const client = await read('lib/data/admin-client.ts');
  const types = await read('lib/types/admin.ts');
  const page = await read('app/admin/students/page.tsx');
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const directory = migration.match(/CREATE OR REPLACE FUNCTION public\.get_admin_student_directory\([\s\S]*?\$\$;/);
  const reader = client.match(/export async function getAdminStudents\([\s\S]*?\n}\n/);
  const studentType = types.match(/export interface AdminStudentDirectoryItem \{[\s\S]*?\n\}/);

  assert.ok(directory);
  assert.match(directory[0], /auth\.uid\(\) IS NULL OR v_role IS NULL OR v_role NOT IN \('super_admin', 'university_admin'\)/);
  assert.match(directory[0], /public\.can_manage_university\(COALESCE\(student\.university_id, profile\.university_id\)\)/);
  assert.match(directory[0], /role\.name IN \('student', 'student_vendor'\)/);
  assert.match(directory[0], /v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 10000/);
  assert.match(directory[0], /unresolved_support_tickets/);
  assert.match(directory[0], /active_account_flags/);
  assert.match(directory[0], /completed_orders/);
  assert.match(migration, /profiles_student_name_trgm_idx[\s\S]*gin_trgm_ops/);
  assert.match(directory[0], /v_search_pattern IS NULL OR lower\(student\.full_name\) LIKE v_search_pattern ESCAPE/);
  assert.doesNotMatch(directory[0], /profile\.email|student\.email|position\(/);
  assert.doesNotMatch(directory[0], /student_id_number|student_id_document_url|payment|total_amount|SUM\(/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_student_directory[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.ok(reader);
  assert.match(reader[0], /rpc\('get_admin_student_directory'/);
  assert.doesNotMatch(reader[0], /from\('profiles'\)|from\('student_profiles'\)/);
  assert.ok(studentType);
  assert.doesNotMatch(studentType[0], /email|student_id_number|document_url/i);
  assert.match(page, /Student Directory/);
  assert.match(page, /unresolved_support_tickets/);
  assert.match(page, /active_account_flags/);
  assert.match(page, /requestVersion/);
  assert.match(middleware, /pathname === '\/admin\/students'/);
  assert.match(layout, /pathname === '\/admin\/students'/);
  assert.match(layout, /item\.href === '\/admin\/students'/);
});

test('university administrators receive a separate membership-scoped dashboard, never the platform summary', async () => {
  const migration = await read('supabase/migrations/20260930000000_0078_university_admin_dashboard_summary.sql');
  const dashboard = await read('app/admin/page.tsx');
  const client = await read('lib/data/admin-client.ts');
  const middleware = await read('lib/supabase/middleware.ts');
  const layout = await read('components/admin/admin-layout.tsx');
  const summary = migration.match(/CREATE OR REPLACE FUNCTION public\.get_admin_university_control_center_summary\([\s\S]*?\$\$;/);

  assert.ok(summary);
  assert.match(summary[0], /current_app_role\(\) IS DISTINCT FROM 'university_admin'/);
  assert.match(summary[0], /membership\.user_id = auth\.uid\(\)[\s\S]*membership\.is_active/);
  assert.match(summary[0], /public\.can_manage_university\(university\.id\)/);
  assert.match(summary[0], /No active university administration scope/);
  assert.match(summary[0], /registrationTrend/);
  assert.match(summary[0], /orderTrend/);
  assert.doesNotMatch(summary[0], /payments|revenue|payment_providers|webhook_data|provider_reference/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_university_control_center_summary[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_admin_university_control_center_summary\(integer\) TO authenticated/);
  assert.match(dashboard, /user\?\.role === 'university_admin'[\s\S]*getAdminUniversityControlCenterSummary/);
  assert.match(dashboard, /user\?\.role === 'super_admin'[\s\S]*getAdminControlCenterSummary/);
  assert.match(dashboard, /University Overview/);
  assert.match(client, /rpc\('get_admin_university_control_center_summary'/);
  assert.match(middleware, /pathname === '\/admin'[\s\S]*pathname === '\/admin\/universities'/);
  assert.match(layout, /pathname === '\/admin'[\s\S]*pathname === '\/admin\/universities'/);
  assert.match(layout, /item\.href === '\/admin'/);
});

test('student account status changes are reasoned, tenant-scoped, student-only, and audited', async () => {
  const migration = await read('supabase/migrations/20260930020000_0092_scoped_student_account_operations.sql');
  const client = await read('lib/data/admin-client.ts');
  const page = await read('app/admin/students/page.tsx');
  const mutation = migration.match(/CREATE OR REPLACE FUNCTION public\.admin_set_student_account_status\([\s\S]*?\$\$;/);
  const audit = migration.match(/CREATE OR REPLACE FUNCTION public\.record_trusted_university_student_action\([\s\S]*?\$\$;/);

  assert.ok(mutation);
  assert.match(mutation[0], /public\.is_super_admin\(\)[\s\S]*v_role = 'university_admin'/);
  assert.match(mutation[0], /role\.name IN \('student', 'student_vendor'\)/);
  assert.match(mutation[0], /public\.can_manage_university\(v_university_id\)/);
  assert.match(mutation[0], /p_status IS NULL OR p_status NOT IN \('active', 'suspended'\)/);
  assert.match(mutation[0], /length\(v_reason\) NOT BETWEEN 10 AND 500/);
  assert.match(mutation[0], /FOR UPDATE OF profile/);
  assert.match(mutation[0], /record_trusted_university_student_action/);
  assert.match(mutation[0], /record_trusted_admin_action/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_set_student_account_status[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_set_student_account_status[\s\S]*TO authenticated/);
  assert.ok(audit);
  assert.match(audit[0], /current_app_role\(\) IS DISTINCT FROM 'university_admin'/);
  assert.match(audit[0], /can_manage_university\(p_university_id\)/);
  assert.match(audit[0], /INSERT INTO public\.audit_logs/);
  assert.match(client, /rpc\('admin_set_student_account_status'/);
  assert.doesNotMatch(client, /from\('profiles'\)\.(?:update|insert|delete)/);
  assert.match(page, /setStudentAccountStatus\(selected\.student_id/);
  assert.match(page, /Reason \(required\)/);
  assert.match(page, /Suspend student/);
  assert.match(page, /Reactivate student/);
  assert.match(page, /requestAccountStatus\(selected\.account_status === 'active' \? 'suspended' : 'active'\)/);
  assert.match(page, /AlertDialogTitle>Confirm student account/);
  assert.match(page, /Confirm suspension/);
  assert.match(page, /Confirm reactivation/);
  assert.match(page, /void confirmAccountStatus\(\)/);
});

test('management recent activity uses trusted audit rows and membership-scoped routing', async () => {
  const migration = await read('supabase/migrations/20260930030000_0093_admin_recent_activity.sql');
  const client = await read('lib/data/admin-client.ts');
  const page = await read('app/admin/page.tsx');
  const reader = migration.match(/CREATE OR REPLACE FUNCTION public\.get_admin_recent_activity\([\s\S]*?\$\$;/);

  assert.ok(reader);
  assert.match(reader[0], /current_app_role\(\)/);
  assert.match(reader[0], /v_role NOT IN \('super_admin', 'university_admin'\)/);
  assert.match(reader[0], /membership\.user_id = auth\.uid\(\) AND membership\.is_active/);
  assert.match(reader[0], /entry\.metadata ->> 'university_id' = membership\.university_id::text/);
  assert.match(reader[0], /v_limit NOT BETWEEN 1 AND 20/);
  assert.match(reader[0], /public\.admin_actions/);
  assert.doesNotMatch(reader[0], /admin_email|target_id/);
  assert.match(reader[0], /SELECT entry\.id, actor\.full_name, entry\.action, entry\.module, entry\.created_at/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_admin_recent_activity[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(client, /rpc\('get_admin_recent_activity'/);
  assert.match(page, /function RecentActivityPanel/);
  assert.match(page, /role === 'university_admin' && !universityRoutes\.has\(entry\.module\)/);
  assert.match(page, /entries\.length === 0 \? <p[^>]*>No recent administrative activity/);
});

test('support ticket owners cannot set operational fields or read private internal notes directly', async () => {
  const migration = await read('supabase/migrations/20260930070000_0097_secure_support_ticket_owner_columns.sql');
  const baseline = await read('supabase/migrations/20260911000000_0000_clean_staging_baseline.sql');
  const supportPermissions = await read('supabase/migrations/20260929140000_0068_moderator_operational_permissions.sql');
  const adminClient = await read('lib/data/admin-client.ts');
  const functionBody = migration.match(/CREATE OR REPLACE FUNCTION public\.create_support_ticket\([\s\S]*?\$\$;/);
  const creator = adminClient.match(/export async function createTicket\([\s\S]*?\n}\n/);

  assert.match(migration, /REVOKE SELECT, INSERT ON public\.support_tickets FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT \([\s\S]*created_at,[\s\S]*updated_at\s*\) ON public\.support_tickets TO authenticated/);
  assert.doesNotMatch(migration.match(/GRANT SELECT \([\s\S]*?\) ON public\.support_tickets TO authenticated/)?.[0] || '', /internal_notes|assigned_to|closed_by|closed_at/);
  assert.match(migration, /GRANT INSERT \(\s*user_id,\s*subject,\s*description,\s*category\s*\) ON public\.support_tickets TO authenticated/);
  assert.ok(functionBody);
  assert.match(functionBody[0], /auth\.uid\(\)/);
  assert.match(functionBody[0], /'SUP-' \|\| upper\(replace\(v_ticket_id::text, '-', ''\)\)/);
  assert.doesNotMatch(functionBody[0], /p_priority|p_assigned_to|internal_notes|closed_by/);
  assert.doesNotMatch(functionBody[0], /'internal_notes'|'assigned_to'|'closed_by'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_support_ticket\(text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(baseline, /CREATE POLICY ticket_replies_owner_insert[\s\S]*WITH CHECK\(author_id=auth\.uid\(\) AND NOT is_internal AND EXISTS\(SELECT 1 FROM public\.support_tickets t WHERE t\.id=ticket_id AND t\.user_id=auth\.uid\(\)\)\)/);
  assert.match(supportPermissions, /CREATE POLICY ticket_replies_owner_read[\s\S]*NOT is_internal[\s\S]*t\.user_id=auth\.uid\(\)/);
  assert.doesNotMatch(supportPermissions, /DROP POLICY IF EXISTS ticket_replies_owner_insert/);
  assert.ok(creator);
  assert.match(creator[0], /rpc\('create_support_ticket'/);
  assert.doesNotMatch(creator[0], /from\('support_tickets'\)|generate_ticket_number|priority:/);
});
