import type { Order, OrderItem, OrderStatus, DeliveryMethod } from '@/lib/types';

export interface Cart {
  id: string;
  user_id: string;
  coupon_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  save_for_later: boolean;
  created_at: string;
  product?: {
    id: string;
    name: string;
    slug: string;
    price: number;
    discount_price: number | null;
    image_url: string | null;
    images: string[];
    stock: number;
    is_active: boolean;
    is_archived: boolean;
    business_id: string;
  } | null;
  service?: {
    id: string;
    name: string;
    slug: string;
    price: number;
    image_url: string | null;
    images: string[];
    duration_estimate: string | null;
    is_active: boolean;
    is_archived: boolean;
    business_id: string;
  } | null;
}

export interface CartWithItems extends Cart {
  items: CartItem[];
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  previous_status: string | null;
  new_status: OrderStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
  changed_by_profile?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface Receipt {
  id: string;
  order_id: string;
  receipt_number: string;
  generated_at: string;
  data: Record<string, unknown>;
}

export type CouponDiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  student_only: boolean;
  vendor_id: string | null;
  university_id: string | null;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id: string | null;
  redeemed_at: string;
}

export interface WishlistItem {
  id: string;
  user_id: string;
  item_type: 'product' | 'service';
  item_id: string;
  collection: string;
  created_at: string;
}

export interface OrderMessage {
  id: string;
  order_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface OrderWithDetails extends Order {
  items: (OrderItem & {
    product?: {
      id: string;
      name: string;
      slug: string;
      image_url: string | null;
    } | null;
    service?: {
      id: string;
      name: string;
      slug: string;
      image_url: string | null;
    } | null;
  })[];
  vendor?: {
    id: string;
    business_name: string;
    business_slug: string;
    logo_url: string | null;
    contact_phone: string | null;
    whatsapp_number: string | null;
    owner_id: string;
  } | null;
  buyer?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
  status_history?: OrderStatusHistory[];
}

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'pending',
  'accepted',
  'processing',
  'ready',
  'out_for_delivery',
  'completed',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, { label: string; description: string; color: string }> = {
  pending: { label: 'Pending', description: 'Order placed, waiting for vendor to accept', color: 'warning' },
  accepted: { label: 'Accepted', description: 'Vendor has accepted the order', color: 'info' },
  processing: { label: 'Processing', description: 'Vendor is preparing your order', color: 'info' },
  ready: { label: 'Ready for Pickup', description: 'Order is ready for pickup', color: 'success' },
  out_for_delivery: { label: 'Out for Delivery', description: 'Order is on its way to you', color: 'info' },
  completed: { label: 'Completed', description: 'Order has been completed', color: 'success' },
  cancelled: { label: 'Cancelled', description: 'Order was cancelled', color: 'error' },
  confirmed: { label: 'Confirmed', description: 'Order confirmed', color: 'info' },
  fulfilled: { label: 'Fulfilled', description: 'Order fulfilled', color: 'success' },
  refunded: { label: 'Refunded', description: 'Order was refunded', color: 'error' },
};

export const BOOKING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'warning' },
  confirmed: { label: 'Confirmed', color: 'success' },
  rescheduled: { label: 'Rescheduled', color: 'info' },
  declined: { label: 'Declined', color: 'error' },
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
};

export const MARKETPLACE_SORT_OPTIONS = [
  { value: 'trending', label: 'Trending' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest First' },
  { value: 'rating', label: 'Top Rated' },
] as const;
