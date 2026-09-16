import type { Profile, University, Vendor, Subscription, Report, Review } from '@/lib/types';

export interface AdminStats {
  totalUsers: number;
  verifiedStudents: number;
  studentVendors: number;
  externalVendors: number;
  businesses: number;
  products: number;
  services: number;
  orders: number;
  universities: number;
  events: number;
  activeSubscriptions: number;
  totalRevenue: number;
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

export interface AdminVendor extends Vendor {
  university_name?: string;
  owner_name?: string;
  owner_email?: string;
  product_count?: number;
  service_count?: number;
  university?: { name: string } | null;
  owner?: { full_name: string | null; email: string } | null;
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
  metadata: Record<string, unknown>;
  ip_address: string | null;
  result: string;
  created_at: string;
  admin?: { full_name: string | null; email: string; avatar_url: string | null } | null;
}

export interface AdminReport extends Report {
  reporter?: { full_name: string | null; email: string } | null;
  moderator?: { full_name: string | null } | null;
  priority?: string | null;
  resolution_note?: string | null;
}

export interface AdminSubscription extends Subscription {
  vendor?: { business_name: string; business_slug: string; owner_id: string } | null;
  extended_by_profile?: { full_name: string | null } | null;
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
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Users', href: '/admin/users', icon: 'Users' },
      { label: 'Businesses', href: '/admin/businesses', icon: 'Store' },
      { label: 'Universities', href: '/admin/universities', icon: 'GraduationCap' },
      { label: 'Categories', href: '/admin/categories', icon: 'FolderTree' },
      { label: 'Orders', href: '/admin/orders', icon: 'ShoppingBag' },
      { label: 'Subscriptions', href: '/admin/subscriptions', icon: 'CreditCard' },
      { label: 'Payments', href: '/admin/payments', icon: 'CreditCard' },
      { label: 'Invoices', href: '/admin/invoices', icon: 'Receipt' },
      { label: 'Coupons', href: '/admin/coupons', icon: 'Ticket' },
      { label: 'Advertisements', href: '/admin/advertisements', icon: 'Megaphone' },
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
