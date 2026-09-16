export type UserRole =
  | 'visitor'
  | 'student'
  | 'student_vendor'
  | 'external_vendor'
  | 'moderator'
  | 'super_admin'
  | 'university_admin';

export const ROLE_IDS: Record<UserRole, number> = {
  visitor: 1,
  student: 2,
  student_vendor: 3,
  external_vendor: 4,
  moderator: 5,
  super_admin: 6,
  university_admin: 7,
};

export type ProfileStatus = 'active' | 'suspended' | 'pending';

export type StudentVerificationStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'alumni'
  | 'suspended';

export type VendorVerificationStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'expired'
  | 'rejected';

export type VerificationRequestStatus = 'pending' | 'approved' | 'rejected';

export type VendorType = 'student_vendor' | 'external_vendor';

export type VerificationRequestType =
  | 'student_id'
  | 'vendor_business'
  | 'address'
  | 'identity';

export interface University {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  city: string | null;
  region: string | null;
  country: string;
  logo_url: string | null;
  hero_image_url: string | null;
  logo_alt_text: string | null;
  hero_alt_text: string | null;
  image_credit: string | null;
  image_source: string | null;
  website_url: string | null;
  description: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  university_id: string | null;
  role_id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  status: ProfileStatus;
  preferences: Record<string, unknown>;
  notification_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  role?: UserRole;
  university?: Pick<University, 'id' | 'name' | 'short_name' | 'slug'>;
}

export interface StudentProfile {
  id: string;
  user_id: string;
  profile_id: string | null;
  university_id: string | null;
  student_id_number: string | null;
  program_of_study: string | null;
  faculty: string | null;
  department: string | null;
  level: string | null;
  admission_year: number | null;
  graduation_year: number | null;
  verification_status: StudentVerificationStatus;
  student_id_document_url: string | null;
  rejection_reason: string | null;
  is_verified_student: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorProfile {
  id: string;
  profile_id: string;
  vendor_type: VendorType;
  verification_status: VendorVerificationStatus;
  subscription_status: string;
  business_category: string | null;
  location_address: string | null;
  location_city: string | null;
  location_region: string | null;
  product_service_type: string | null;
  verification_document_url: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  request_type: VerificationRequestType;
  documents: { url: string; label: string }[];
  status: VerificationRequestStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  target_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role: string;
  permission: string;
  created_at: string;
}

export interface IndexNumberVerification {
  id: string;
  university_id: string;
  index_number: string;
  student_profile_id: string | null;
  status: VerificationRequestStatus;
  is_duplicate: boolean;
  created_at: string;
}

export interface Vendor {
  id: string;
  university_id: string | null;
  owner_id: string;
  business_name: string;
  business_slug: string;
  business_type: string | null;
  description: string | null;
  is_student_business: boolean;
  is_verified: boolean;
  is_active: boolean;
  logo_url: string | null;
  cover_image_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website_url: string | null;
  rating_avg: number;
  rating_count: number;
  opening_hours: Record<string, { open: string; close: string }> | null;
  whatsapp_number: string | null;
  social_links: Record<string, string>;
  delivery_available: boolean;
  service_radius_km: number | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  is_temporarily_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  vendor_id: string;
  university_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  university_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  discount_price: number | null;
  sku: string | null;
  tags: string[];
  images: string[];
  is_archived: boolean;
  low_stock_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  university_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  duration_estimate: string | null;
  image_url: string | null;
  is_active: boolean;
  images: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'processing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'confirmed'
  | 'fulfilled'
  | 'refunded';

export type DeliveryMethod = 'pickup' | 'delivery';
export type OrderType = 'product' | 'service' | 'mixed';

export interface DeliveryAddress {
  line1?: string;
  city?: string;
  region?: string;
  landmark?: string;
  instructions?: string;
}

export interface Order {
  id: string;
  university_id: string | null;
  buyer_id: string;
  vendor_id: string | null;
  status: OrderStatus;
  total_amount: number;
  currency: string;
  notes: string | null;
  order_number: string | null;
  order_type: OrderType;
  delivery_method: DeliveryMethod | null;
  delivery_address: DeliveryAddress | null;
  delivery_fee: number;
  delivery_instructions: string | null;
  estimated_completion: string | null;
  coupon_code: string | null;
  coupon_discount: number;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  vendor_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
  unit_name: string | null;
  unit_image_url: string | null;
  item_name: string | null;
  booking_date: string | null;
  booking_time: string | null;
  booking_notes: string | null;
  booking_status: 'pending' | 'confirmed' | 'rescheduled' | 'declined' | null;
  rescheduled_to: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: string | null;
  provider_reference: string | null;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  vendor_id: string;
  plan: string;
  status: string;
  started_at: string;
  ends_at: string | null;
  provider_reference: string | null;
  amount: number | null;
  currency: string;
  payment_method: string | null;
  payment_reference: string | null;
  created_at: string;
  auto_renew?: boolean;
  cancelled_at?: string | null;
  renewal_failed_at?: string | null;
  extended_by?: string | null;
  extension_note?: string | null;
  grace_period_ends_at?: string | null;
  last_payment_id?: string | null;
  next_billing_date?: string | null;
}

export interface EventItem {
  id: string;
  university_id: string | null;
  organizer_id: string;
  title: string;
  slug: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  is_virtual: boolean;
  cover_image_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  reviewer_id: string;
  vendor_id: string | null;
  product_id: string | null;
  event_id: string | null;
  rating: number;
  comment: string | null;
  is_approved: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  conversation_id: string | null;
  is_archived_by_sender: boolean;
  is_archived_by_recipient: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Advertisement {
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
}

export interface Location {
  id: string;
  university_id: string | null;
  owner_type: string | null;
  owner_id: string | null;
  label: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  status: string;
  moderator_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  profile: Profile | null;
  studentProfile: StudentProfile | null;
  vendorProfile: VendorProfile | null;
}
