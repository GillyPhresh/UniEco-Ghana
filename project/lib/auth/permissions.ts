import type { UserRole } from '@/lib/types';

export type Permission =
  | 'can_browse'
  | 'can_view_businesses'
  | 'can_view_products'
  | 'can_view_events'
  | 'can_manage_profile'
  | 'can_save_businesses'
  | 'can_review_businesses'
  | 'can_message_vendors'
  | 'can_purchase'
  | 'can_register_business'
  | 'can_manage_business'
  | 'can_add_products'
  | 'can_add_services'
  | 'can_manage_products'
  | 'can_manage_services'
  | 'can_receive_orders'
  | 'can_view_analytics'
  | 'can_manage_customers'
  | 'can_manage_promotions'
  | 'can_review_reports'
  | 'can_moderate_content'
  | 'can_review_verifications'
  | 'can_manage_users'
  | 'can_manage_universities'
  | 'can_manage_vendors'
  | 'can_manage_businesses'
  | 'can_manage_payments'
  | 'can_manage_system_settings'
  | 'can_view_audit_logs';

// UI affordances only. Sensitive authorization is enforced by Supabase RLS
// and database functions; do not use this map as a server trust boundary.
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  visitor: [
    'can_browse',
    'can_view_businesses',
    'can_view_products',
    'can_view_events',
  ],
  student: [
    'can_browse',
    'can_view_businesses',
    'can_view_products',
    'can_view_events',
    'can_manage_profile',
    'can_save_businesses',
    'can_review_businesses',
    'can_message_vendors',
    'can_purchase',
    'can_register_business',
  ],
  student_vendor: [
    'can_browse',
    'can_view_businesses',
    'can_view_products',
    'can_view_events',
    'can_manage_profile',
    'can_save_businesses',
    'can_review_businesses',
    'can_message_vendors',
    'can_purchase',
    'can_manage_business',
    'can_add_products',
    'can_add_services',
    'can_manage_products',
    'can_manage_services',
    'can_receive_orders',
    'can_view_analytics',
  ],
  external_vendor: [
    'can_browse',
    'can_view_businesses',
    'can_view_products',
    'can_view_events',
    'can_manage_profile',
    'can_manage_business',
    'can_manage_products',
    'can_manage_services',
    'can_manage_customers',
    'can_manage_promotions',
  ],
  moderator: [
    'can_browse',
    'can_view_businesses',
    'can_view_products',
    'can_view_events',
    'can_review_reports',
    'can_moderate_content',
    'can_review_verifications',
  ],
  super_admin: [
    'can_browse',
    'can_view_businesses',
    'can_view_products',
    'can_view_events',
    'can_manage_users',
    'can_manage_universities',
    'can_manage_vendors',
    'can_manage_businesses',
    'can_manage_payments',
    'can_manage_system_settings',
    'can_view_analytics',
    'can_review_reports',
    'can_moderate_content',
    'can_review_verifications',
    'can_view_audit_logs',
  ],
  university_admin: [
    'can_browse',
    'can_view_businesses',
    'can_view_products',
    'can_view_events',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function isStaff(role: UserRole): boolean {
  return role === 'moderator' || role === 'super_admin';
}

export function isAdmin(role: UserRole): boolean {
  return role === 'super_admin';
}

export function isVendor(role: UserRole): boolean {
  return role === 'student_vendor' || role === 'external_vendor';
}

export function isStudent(role: UserRole): boolean {
  return role === 'student' || role === 'student_vendor';
}

export const ROLE_LABELS: Record<UserRole, string> = {
  visitor: 'Visitor',
  student: 'Student',
  student_vendor: 'Student Vendor',
  external_vendor: 'External Vendor',
  moderator: 'Moderator',
  super_admin: 'Super Admin',
  university_admin: 'University Administrator',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  can_browse: 'Browse the platform',
  can_view_businesses: 'View businesses',
  can_view_products: 'View products',
  can_view_events: 'View events',
  can_manage_profile: 'Manage own profile',
  can_save_businesses: 'Save businesses',
  can_review_businesses: 'Review businesses',
  can_message_vendors: 'Message vendors',
  can_purchase: 'Purchase products and services',
  can_register_business: 'Register a business',
  can_manage_business: 'Manage business profile',
  can_add_products: 'Add products',
  can_add_services: 'Add services',
  can_manage_products: 'Manage products',
  can_manage_services: 'Manage services',
  can_receive_orders: 'Receive orders',
  can_view_analytics: 'View analytics',
  can_manage_customers: 'Manage customers',
  can_manage_promotions: 'Manage promotions',
  can_review_reports: 'Review reports',
  can_moderate_content: 'Moderate content',
  can_review_verifications: 'Review verification requests',
  can_manage_users: 'Manage users',
  can_manage_universities: 'Manage universities',
  can_manage_vendors: 'Manage vendors',
  can_manage_businesses: 'Manage businesses',
  can_manage_payments: 'Manage payments',
  can_manage_system_settings: 'Manage system settings',
  can_view_audit_logs: 'View audit logs',
};
