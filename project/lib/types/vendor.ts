import type { Vendor, Review } from '@/lib/types';

export interface BusinessGalleryItem {
  id: string;
  vendor_id: string;
  image_url: string;
  caption: string | null;
  image_type: 'storefront' | 'banner' | 'product_highlight' | 'general';
  sort_order: number;
  created_at: string;
}

export interface BusinessHour {
  id: string;
  vendor_id: string;
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
}

export interface BusinessHoliday {
  id: string;
  vendor_id: string;
  holiday_date: string;
  description: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  vendor_id: string;
  invoice_number: string;
  invoice_type: 'subscription' | 'advertisement';
  reference_id: string | null;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'cancelled';
  payment_reference: string | null;
  issued_at: string;
  paid_at: string | null;
  created_at: string;
}

export type AdType = 'featured_business' | 'homepage_banner' | 'category_promotion' | 'search_promotion' | 'event_promotion';
export type AdRequestStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'completed';

export interface AdRequest {
  id: string;
  vendor_id: string;
  ad_type: AdType;
  title: string;
  description: string | null;
  image_url: string | null;
  target_url: string | null;
  requested_duration_days: number;
  estimated_reach: string | null;
  estimated_cost: number;
  status: AdRequestStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewResponse {
  id: string;
  review_id: string;
  vendor_id: string;
  response_body: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewWithResponse extends Review {
  reviewer: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  response: ReviewResponse | null;
}

export interface VendorAnalytics {
  id: string;
  vendor_id: string;
  profile_views: number;
  product_views: number;
  service_views: number;
  search_appearances: number;
  messages_received: number;
  saved_count: number;
  monthly_profile_views: Record<string, number>;
  monthly_messages: Record<string, number>;
  monthly_reviews: Record<string, number>;
  response_rate: number;
  avg_response_time_hours: number;
  trust_score: number;
  updated_at: string;
}

export interface VendorSettings {
  id: string;
  vendor_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  order_alerts: boolean;
  review_alerts: boolean;
  message_alerts: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorWithAnalytics extends Vendor {
  analytics?: VendorAnalytics | null;
  settings?: VendorSettings | null;
  gallery?: BusinessGalleryItem[];
  hours?: BusinessHour[];
}

export interface VendorConversation {
  id: string;
  participant_one: string;
  participant_two: string;
  created_at: string;
  updated_at: string;
  other_participant: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  last_message: {
    body: string | null;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count: number;
  is_archived: boolean;
}

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const AD_TYPE_LABELS: Record<AdType, string> = {
  featured_business: 'Featured Business',
  homepage_banner: 'Homepage Banner',
  category_promotion: 'Category Promotion',
  search_promotion: 'Search Promotion',
  event_promotion: 'Event Promotion',
};

export const AD_TYPE_DESCRIPTIONS: Record<AdType, string> = {
  featured_business: 'Appear at the top of business listings and discovery pages',
  homepage_banner: 'Showcase your business with a banner on the homepage',
  category_promotion: 'Get highlighted when students browse your category',
  search_promotion: 'Appear first when students search for relevant keywords',
  event_promotion: 'Promote your business alongside campus events',
};

export const AD_TYPE_PRICING: Record<AdType, { daily: number; minDays: number }> = {
  featured_business: { daily: 10, minDays: 7 },
  homepage_banner: { daily: 25, minDays: 3 },
  category_promotion: { daily: 8, minDays: 7 },
  search_promotion: { daily: 12, minDays: 5 },
  event_promotion: { daily: 15, minDays: 3 },
};

export const SUBSCRIPTION_PLANS = {
  student_vendor: {
    name: 'Student Vendor',
    monthly: 20,
    currency: 'GHS',
    features: [
      'Business profile with logo and cover image',
      'Up to 50 products',
      'Up to 20 services',
      'Business gallery (up to 20 images)',
      'Customer messaging',
      'Review management',
      'Basic analytics',
    ],
  },
  external_vendor: {
    name: 'External Vendor',
    monthly: 50,
    currency: 'GHS',
    features: [
      'Full business profile with branding',
      'Unlimited products',
      'Unlimited services',
      'Business gallery (up to 50 images)',
      'Customer messaging',
      'Review management',
      'Advanced analytics',
      'Promotion requests',
      'Priority support',
    ],
  },
} as const;

export const VERIFICATION_STATUS_LABELS: Record<string, { label: string; description: string; color: string }> = {
  pending: { label: 'Pending', description: 'Your verification is being reviewed by our team. This usually takes 1-2 business days.', color: 'warning' },
  active: { label: 'Verified', description: 'Your business is verified. Students can trust your listing.', color: 'success' },
  rejected: { label: 'Rejected', description: 'Your verification was not approved. Please review the reason and resubmit.', color: 'error' },
  suspended: { label: 'Suspended', description: 'Your business is temporarily suspended. Contact support for assistance.', color: 'error' },
  expired: { label: 'Expired', description: 'Your verification has expired. Please renew your documents.', color: 'warning' },
};

export const AD_STATUS_LABELS: Record<AdRequestStatus, { label: string; color: string }> = {
  pending: { label: 'Pending Review', color: 'warning' },
  approved: { label: 'Approved', color: 'success' },
  rejected: { label: 'Rejected', color: 'error' },
  active: { label: 'Active', color: 'success' },
  completed: { label: 'Completed', color: 'muted' },
};
