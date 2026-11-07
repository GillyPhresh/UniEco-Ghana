export type ModeratorPermission =
  | 'can_review_reports'
  | 'can_review_verifications'
  | 'can_manage_support'
  | 'can_moderate_content'
  | 'can_manage_communications';

const MODERATOR_ROUTE_PERMISSIONS: ReadonlyArray<{
  prefix: string;
  permission: ModeratorPermission;
}> = [
  { prefix: '/admin/moderation', permission: 'can_review_reports' },
  { prefix: '/admin/trust-safety', permission: 'can_review_reports' },
  { prefix: '/admin/verification', permission: 'can_review_verifications' },
  { prefix: '/admin/support', permission: 'can_manage_support' },
  { prefix: '/admin/communication', permission: 'can_manage_communications' },
  { prefix: '/admin/advertisements', permission: 'can_moderate_content' },
  { prefix: '/admin/reviews', permission: 'can_moderate_content' },
  { prefix: '/admin/events', permission: 'can_moderate_content' },
  { prefix: '/admin/community-posts', permission: 'can_moderate_content' },
];

function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** UI visibility hint only; middleware and database RPCs remain authoritative. */
export function isModeratorScopedAdminPath(pathname: string): boolean {
  return MODERATOR_ROUTE_PERMISSIONS.some(({ prefix }) => matchesRoute(pathname, prefix));
}

/** Returns the database capability that middleware must verify for this route. */
export function getModeratorPermissionForAdminPath(pathname: string): ModeratorPermission | null {
  return MODERATOR_ROUTE_PERMISSIONS.find(({ prefix }) => matchesRoute(pathname, prefix))?.permission ?? null;
}
