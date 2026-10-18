import type { Profile, University, Vendor, Subscription, Report, Review } from '@/lib/types';

export interface AdminStats {
  totalUsers: number;
  verifiedStudents: number;
  studentVendors: number;
  externalVendors: number;
  businesses: number;
  products: number;
  activeProducts: number;
  services: number;
  activeServices: number;
  orders: number;
  ordersToday: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  universities: number;
  activeUniversities: number;
  events: number;
  activeSubscriptions: number;
  pendingVendorVerification: number;
  pendingAdApprovals: number;
  unresolvedSupportTickets: number;
}

export interface AdminControlCenterSummary {
  stats: AdminStats;
  registrationTrend: Array<{ date: string; count: number }>;
  orderTrend: Array<{ date: string; count: number }>;
  businessCategories: Array<{ category: string; count: number }>;
  universityGrowth: Array<{ name: string; students: number; vendors: number; businesses: number }>;
}

/** Operational metrics limited to the caller's active university memberships. */
export interface AdminUniversityControlCenterSummary {
  stats: {
    universities: number;
    students: number;
    activeStudents: number;
    verifiedStudents: number;
    studentVendors: number;
    externalVendors: number;
    activeVendors: number;
    businesses: number;
    activeBusinesses: number;
    products: number;
    activeProducts: number;
    services: number;
    activeServices: number;
    orders: number;
    ordersToday: number;
    ordersThisMonth: number;
    pendingOrders: number;
    completedOrders: number;
    events: number;
    pendingVendorVerification: number;
    unresolvedSupportTickets: number;
  };
  registrationTrend: Array<{ date: string; count: number }>;
  orderTrend: Array<{ date: string; count: number }>;
  businessCategories: Array<{ category: string; count: number }>;
  universityActivity: Array<{ name: string; students: number; vendors: number; businesses: number }>;
}

export interface AdminUser extends Omit<Profile, 'role'> {
  role_name?: string;
  university_name?: string;
  student_profile?: {
    verification_status: string;
    is_verified_student: boolean;
    student_id_number: string | null;
    program_of_study: string | null;
  } | null;
  vendor_profile?: {
    vendor_type: string;
    verification_status: string;
    subscription_status: string;
  } | null;
  role?: { name: string } | null;
}

/** Minimal directory row; restricted profiles are loaded only through authorized workflows. */
export interface AdminUserDirectoryItem {
  id: string;
  full_name: string | null;
  email: string;
  role_id: number;
  status: string;
  is_active: boolean;
  created_at: string;
  role: { name: string };
  university?: { name: string } | null;
}

export interface AdminVendor extends Vendor {
  university_name?: string;
  owner_name?: string;
  owner_email?: string;
  product_count?: number;
  service_count?: number;
  university?: { name: string } | null;
  owner?: { full_name: string | null; email: string | null } | null;
}

/** Minimal reviewer view; it intentionally omits private document references. */
export interface VendorVerificationQueueItem {
  id: string;
  business_name: string;
  business_type: string | null;
  logo_url: string | null;
  contact_phone: string | null;
  is_verified: boolean;
  is_active: boolean;
  is_student_business: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  university?: { name: string } | null;
  owner?: { full_name: string | null; email: string | null } | null;
}

export interface VendorLocationReview {
  vendor_id: string;
  business_name: string;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  selection_source: string | null;
  verification_status: string | null;
  public_visibility: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  last_confirmed_at: string | null;
}

/** Student verification details without exposing the private storage object path. */
export interface AdminStudentVerification {
  id: string;
  user_id: string;
  student_id_number: string | null;
  program_of_study: string | null;
  faculty: string | null;
  department: string | null;
  level: string | null;
  verification_status: string;
  is_verified_student: boolean;
  has_student_id_document: boolean;
  rejection_reason: string | null;
  created_at: string;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    university: { name: string } | null;
  };
}

/** Privacy-minimized student operations row; never contains student document paths or academic ID numbers. */
export interface AdminStudentDirectoryItem {
  student_id: string;
  full_name: string | null;
  university_id: string | null;
  university_name: string | null;
  role_name: 'student' | 'student_vendor';
  verification_status: string;
  account_status: string;
  is_active: boolean;
  vendor_status: 'active' | 'inactive' | null;
  total_orders: number;
  completed_orders: number;
  unresolved_support_tickets: number;
  active_account_flags: number;
  registered_at: string;
}

/** Narrow vendor directory projection for super-admin and assigned university-admin views. */
export interface AdminVendorDirectoryItem {
  id: string;
  business_name: string;
  business_type: string | null;
  is_verified: boolean;
  is_active: boolean;
  is_student_business: boolean;
  delivery_available: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  university: { name: string } | null;
  owner: { full_name: string | null; email: string | null } | null;
}

export interface SupportTicket {
  id: string;
  ticket_number: string | null;
  user_id: string;
  subject: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  internal_notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  user?: { full_name: string | null; email: string; avatar_url: string | null } | null;
  assignee?: { full_name: string | null } | null;
  replies?: TicketReply[];
}

export interface TicketReply {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author?: { full_name: string | null; avatar_url: string | null; email: string } | null;
}

export interface AdminSupportAssignee {
  user_id: string;
  full_name: string | null;
  role_name: string;
}

export type AdminQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  page_type: string;
  is_published: boolean;
  published_at: string | null;
  author_id: string | null;
  meta_description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  author?: { full_name: string | null } | null;
}

export interface CmsFaqEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  children?: Category[];
  parent?: { name: string } | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  target_audience: string;
  university_id: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_at: string;
  university?: { name: string; short_name: string } | null;
}

export interface AdminAction {
  id: string;
  admin_id: string;
  action: string;
  module: string;
  target_type: string | null;
  target_id: string | null;
  reason?: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  result: string;
  created_at: string;
  admin?: { full_name: string | null; email: string; avatar_url: string | null } | null;
}

/** Privacy-minimized trusted activity stream for the management overview. */
export interface AdminRecentActivityItem {
  id: string;
  actor_name: string | null;
  action: string;
  module: string;
  created_at: string;
}

export interface AdminOperationalAlert {
  alert_key: 'payment_reconciliation' | 'communication_failures' | 'urgent_support' | 'priority_reports' | 'content_reviews' | 'pending_advertisements' | 'stale_vendor_verification' | 'low_stock_products';
  severity: 'critical' | 'high' | 'medium';
  affected_count: number;
  window_start: string | null;
}

export interface AdminReport extends Report {
  reporter?: { full_name: string | null; email: string } | null;
  moderator?: { full_name: string | null } | null;
  priority?: string | null;
  resolution_note?: string | null;
}

export interface AdminModerationCase {
  id: string;
  case_number: string;
  case_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'waiting_info' | 'resolved' | 'dismissed' | 'escalated';
  title: string;
  description: string | null;
  subject_type: string;
  subject_id: string;
  university_name: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  priority: number;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminModerationCaseEvent {
  event_id: string;
  event_type: string;
  actor_name: string | null;
  previous_assignee_name: string | null;
  assignee_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface AdminModerationReviewer {
  user_id: string;
  full_name: string | null;
  role_name: 'moderator' | 'super_admin';
}

export interface AdminEventModerationFlag {
  flag_id: string;
  event_id: string;
  event_title: string;
  event_description: string | null;
  university_id: string | null;
  university_name: string | null;
  event_start_time: string | null;
  is_published: boolean;
  flag_reason: string;
  flag_details: string | null;
  flag_status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  flagged_at: string;
}

export interface AdminEventOperationRow {
  event_id: string;
  title: string;
  university_id: string | null;
  university_name: string | null;
  start_time: string | null;
  location: string | null;
  is_published: boolean;
  created_at: string;
}

/** Narrow review moderation queue row; no reviewer identity or private account data is returned. */
export interface AdminReviewQueueItem {
  review_id: string;
  target_title: string;
  vendor_name: string | null;
  university_name: string | null;
  rating: number;
  comment: string | null;
  moderation_status: 'pending_review' | 'published' | 'flagged' | 'hidden' | 'removed';
  flag_reason: string | null;
  created_at: string;
}

export interface AdminSubscription extends Omit<Subscription, 'provider_reference' | 'payment_method' | 'payment_reference' | 'extended_by' | 'extension_note'> {
  vendor?: { business_name: string; business_slug: string } | null;
}

export interface AdminAdvertisement {
  id: string;
  vendor_id: string | null;
  university_id: string | null;
  title: string | null;
  image_url: string | null;
  target_url: string | null;
  placement: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  priority: number;
  is_featured: boolean;
  is_sponsored: boolean;
  vendor?: { business_name: string } | null;
  university?: { name: string } | null;
  reviewer?: { full_name: string | null } | null;
}

export interface AdminOrder {
  id: string;
  order_number: string | null;
  buyer_id: string;
  vendor_id: string | null;
  status: string;
  total_amount: number;
  order_type: string;
  delivery_method: string | null;
  created_at: string;
  completed_at: string | null;
  buyer?: { full_name: string | null; email: string } | null;
  vendor?: { business_name: string } | null;
  items_count?: number;
}

export interface AdminDeliveryItem {
  order_id: string;
  order_number: string | null;
  university_name: string | null;
  vendor_name: string | null;
  order_status: string;
  delivery_method: string | null;
  latest_event: string | null;
  latest_event_at: string | null;
  created_at: string;
}

export interface ManagementSearchResult {
  resource_type: 'vendor' | 'order' | 'university' | 'user' | 'business' | 'product' | 'service' | 'event';
  resource_id: string;
  title: string;
  subtitle: string;
  university_id: string | null;
  created_at: string;
}

export interface AnalyticsData {
  date: string;
  users: number;
  orders: number;
  revenue: number;
}

export interface UniversityGrowthData {
  name: string;
  students: number;
  vendors: number;
  businesses: number;
}

export interface CategoryPopularityData {
  category: string;
  count: number;
}

export const ADMIN_NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin', icon: 'LayoutDashboard' },
      { label: 'Analytics', href: '/admin/analytics', icon: 'BarChart3' },
      { label: 'Financial', href: '/admin/financial', icon: 'Wallet' },
      { label: 'System Health', href: '/admin/system-health', icon: 'Activity' },
      { label: 'Search', href: '/admin/search', icon: 'Search' },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Users', href: '/admin/users', icon: 'Users' },
      { label: 'Student Directory', href: '/admin/students', icon: 'GraduationCap' },
      { label: 'Businesses', href: '/admin/businesses', icon: 'Store' },
      { label: 'Universities', href: '/admin/universities', icon: 'GraduationCap' },
      { label: 'Events', href: '/admin/events', icon: 'CalendarDays' },
      { label: 'Categories', href: '/admin/categories', icon: 'FolderTree' },
      { label: 'Orders', href: '/admin/orders', icon: 'ShoppingBag' },
      { label: 'Delivery Operations', href: '/admin/delivery', icon: 'Truck' },
      { label: 'Subscriptions', href: '/admin/subscriptions', icon: 'CreditCard' },
      { label: 'Payments', href: '/admin/payments', icon: 'CreditCard' },
      { label: 'Sponsored Access', href: '/admin/registration-invites', icon: 'Ticket' },
      { label: 'Invoices', href: '/admin/invoices', icon: 'Receipt' },
      { label: 'Coupons', href: '/admin/coupons', icon: 'Ticket' },
      { label: 'Advertisements', href: '/admin/advertisements', icon: 'Megaphone' },
      { label: 'Reviews', href: '/admin/reviews', icon: 'Star' },
      { label: 'Refunds', href: '/admin/refunds', icon: 'RotateCcw' },
    ],
  },
  {
    label: 'Verification',
    items: [
      { label: 'Students', href: '/admin/verification/students', icon: 'UserCheck' },
      { label: 'Vendors', href: '/admin/verification/vendors', icon: 'StoreCheck' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Moderation', href: '/admin/moderation', icon: 'Flag' },
      { label: 'Trust & Safety Cases', href: '/admin/trust-safety', icon: 'ShieldAlert' },
      { label: 'Support Tickets', href: '/admin/support', icon: 'LifeBuoy' },
      { label: 'Communication Hub', href: '/admin/communication', icon: 'Bell' },
      { label: 'Broadcasts', href: '/admin/broadcasts', icon: 'Megaphone' },
      { label: 'Announcements', href: '/admin/announcements', icon: 'Bell' },
      { label: 'CMS', href: '/admin/cms', icon: 'FileText' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: 'ScrollText' },
      { label: 'Roles & Permissions', href: '/admin/roles', icon: 'ShieldCheck' },
    ],
  },
] as const;
