'use client';

import { supabase } from '@/lib/supabase/client';
import type { Order, OrderItem, OrderStatus, DeliveryMethod, Product, Service, DeliveryAddress } from '@/lib/types';
import type {
  Cart, CartItem, CartWithItems, OrderWithDetails, OrderStatusHistory,
  Receipt, Coupon, WishlistItem, OrderMessage,
} from '@/lib/types/marketplace';

// ============================================================
// Cart Operations
// ============================================================

export async function getOrCreateCart(): Promise<Cart | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from('carts')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) return existing as Cart;

  const { data: created } = await supabase
    .from('carts')
    .insert({ user_id: user.id })
    .select('*')
    .single();

  return created as Cart | null;
}

export async function getCartItems(): Promise<CartItem[]> {
  const cart = await getOrCreateCart();
  if (!cart) return [];

  const { data } = await supabase
    .from('cart_items')
    .select(`
      *,
      product:products(id, name, slug, price, discount_price, image_url, images, stock, is_active, is_archived, business_id),
      service:services(id, name, slug, price, image_url, images, duration_estimate, is_active, is_archived, business_id)
    `)
    .eq('cart_id', cart.id)
    .order('created_at', { ascending: false });

  return (data || []) as unknown as CartItem[];
}

export async function addToCart(productId?: string, serviceId?: string, quantity = 1): Promise<{ error: string | null }> {
  const cart = await getOrCreateCart();
  if (!cart) return { error: 'Not authenticated' };

  if (productId) {
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id);
      return { error: error?.message || null };
    }

    const { error } = await supabase
      .from('cart_items')
      .insert({ cart_id: cart.id, product_id: productId, quantity });
    return { error: error?.message || null };
  }

  if (serviceId) {
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id')
      .eq('cart_id', cart.id)
      .eq('service_id', serviceId)
      .maybeSingle();

    if (existing) return { error: 'This service is already in your cart' };

    const { error } = await supabase
      .from('cart_items')
      .insert({ cart_id: cart.id, service_id: serviceId, quantity: 1 });
    return { error: error?.message || null };
  }

  return { error: 'No item specified' };
}

export async function updateCartQuantity(itemId: string, quantity: number): Promise<{ error: string | null }> {
  if (quantity <= 0) {
    return removeFromCart(itemId);
  }

  const { error } = await supabase
    .from('cart_items')
    .update({ quantity })
    .eq('id', itemId);
  return { error: error?.message || null };
}

export async function removeFromCart(itemId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', itemId);
  return { error: error?.message || null };
}

export async function toggleSaveForLater(itemId: string, save: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('cart_items')
    .update({ save_for_later: save })
    .eq('id', itemId);
  return { error: error?.message || null };
}

export async function applyCouponToCart(couponCode: string): Promise<{ error: string | null; coupon?: Coupon }> {
  const cart = await getOrCreateCart();
  if (!cart) return { error: 'Not authenticated' };

  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', couponCode.toUpperCase())
    .eq('is_active', true)
    .maybeSingle();

  if (!coupon) return { error: 'Invalid coupon code' };

  const now = new Date();
  if (new Date(coupon.starts_at) > now || new Date(coupon.ends_at) < now) {
    return { error: 'This coupon has expired' };
  }

  if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
    return { error: 'This coupon has reached its usage limit' };
  }

  const { error } = await supabase
    .from('carts')
    .update({ coupon_code: couponCode.toUpperCase() })
    .eq('id', cart.id);

  if (error) return { error: error.message };

  return { error: null, coupon: coupon as Coupon };
}

export async function removeCouponFromCart(): Promise<{ error: string | null }> {
  const cart = await getOrCreateCart();
  if (!cart) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('carts')
    .update({ coupon_code: null })
    .eq('id', cart.id);
  return { error: error?.message || null };
}

export interface CartSummary {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  itemCount: number;
  couponCode: string | null;
}

export function calculateCartSummary(
  items: CartItem[],
  deliveryMethod: DeliveryMethod = 'pickup',
  deliveryFee = 0,
  coupon?: Coupon | null
): CartSummary {
  const activeItems = items.filter(i => !i.save_for_later);
  let subtotal = 0;

  for (const item of activeItems) {
    const price = item.product
      ? (item.product.discount_price || item.product.price)
      : item.service?.price || 0;
    subtotal += price * item.quantity;
  }

  let discount = 0;
  if (coupon && subtotal >= coupon.min_order_amount) {
    if (coupon.discount_type === 'percentage') {
      discount = (subtotal * coupon.discount_value) / 100;
      if (coupon.max_discount_amount) {
        discount = Math.min(discount, coupon.max_discount_amount);
      }
    } else {
      discount = coupon.discount_value;
    }
  }

  const fee = deliveryMethod === 'delivery' ? deliveryFee : 0;
  const total = Math.max(0, subtotal - discount) + fee;
  const itemCount = activeItems.reduce((sum, i) => sum + i.quantity, 0);

  return { subtotal, discount, deliveryFee: fee, total, itemCount, couponCode: coupon?.code || null };
}

// ============================================================
// Marketplace Browsing
// ============================================================

export async function getTrendingProducts(limit = 8): Promise<(Product & { vendor?: { business_name: string; business_slug: string; logo_url: string | null } })[]> {
  const { data } = await supabase
    .from('products')
    .select(`
      *,
      business:businesses(
        vendor:vendors(id, business_name, business_slug, logo_url)
      )
    `)
    .eq('is_active', true)
    .eq('is_archived', false)
    .gt('stock', 0)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((p: Record<string, unknown>) => {
    const business = p.business as Record<string, unknown> | null;
    const vendorArr = business?.vendor as Record<string, unknown>[] | null;
    const vendor = vendorArr?.[0];
    return { ...(p as unknown as Product), vendor: vendor ? { business_name: vendor.business_name as string, business_slug: vendor.business_slug as string, logo_url: vendor.logo_url as string | null } : undefined };
  });
}

export async function getFeaturedServices(limit = 6): Promise<(Service & { vendor?: { business_name: string; business_slug: string; logo_url: string | null } })[]> {
  const { data } = await supabase
    .from('services')
    .select(`
      *,
      business:businesses(
        vendor:vendors(id, business_name, business_slug, logo_url)
      )
    `)
    .eq('is_active', true)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((s: Record<string, unknown>) => {
    const business = s.business as Record<string, unknown> | null;
    const vendorArr = business?.vendor as Record<string, unknown>[] | null;
    const vendor = vendorArr?.[0];
    return { ...(s as unknown as Service), vendor: vendor ? { business_name: vendor.business_name as string, business_slug: vendor.business_slug as string, logo_url: vendor.logo_url as string | null } : undefined };
  });
}

export async function getDealsAndPromotions(limit = 8): Promise<(Product & { vendor?: { business_name: string; business_slug: string } })[]> {
  const { data } = await supabase
    .from('products')
    .select(`
      *,
      business:businesses(
        vendor:vendors(id, business_name, business_slug)
      )
    `)
    .eq('is_active', true)
    .eq('is_archived', false)
    .not('discount_price', 'is', null)
    .gt('stock', 0)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((p: Record<string, unknown>) => {
    const business = p.business as Record<string, unknown> | null;
    const vendorArr = business?.vendor as Record<string, unknown>[] | null;
    const vendor = vendorArr?.[0];
    return { ...(p as unknown as Product), vendor: vendor ? { business_name: vendor.business_name as string, business_slug: vendor.business_slug as string } : undefined };
  });
}

export async function getRecentlyAddedProducts(limit = 8): Promise<(Product & { vendor?: { business_name: string; business_slug: string } })[]> {
  const { data } = await supabase
    .from('products')
    .select(`
      *,
      business:businesses(
        vendor:vendors(id, business_name, business_slug)
      )
    `)
    .eq('is_active', true)
    .eq('is_archived', false)
    .gt('stock', 0)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((p: Record<string, unknown>) => {
    const business = p.business as Record<string, unknown> | null;
    const vendorArr = business?.vendor as Record<string, unknown>[] | null;
    const vendor = vendorArr?.[0];
    return { ...(p as unknown as Product), vendor: vendor ? { business_name: vendor.business_name as string, business_slug: vendor.business_slug as string } : undefined };
  });
}

export async function searchProducts(params: {
  query?: string;
  category?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<{ products: (Product & { vendor?: { business_name: string; business_slug: string; logo_url: string | null } })[]; total: number }> {
  let query = supabase
    .from('products')
    .select(`
      *,
      business:businesses(
        vendor:vendors(id, business_name, business_slug, logo_url)
      )
    `, { count: 'exact' })
    .eq('is_active', true)
    .eq('is_archived', false)
    .gt('stock', 0);

  if (params.query) {
    query = query.or(`name.ilike.%${params.query}%,description.ilike.%${params.query}%`);
  }

  if (params.category) {
    query = query.eq('business.business_type', params.category);
  }

  switch (params.sort) {
    case 'price_low':
      query = query.order('price', { ascending: true });
      break;
    case 'price_high':
      query = query.order('price', { ascending: false });
      break;
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'rating':
      query = query.order('created_at', { ascending: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const limit = params.limit || 12;
  const offset = params.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count } = await query;

  if (!data) return { products: [], total: 0 };

  const products = data.map((p: Record<string, unknown>) => {
    const business = p.business as Record<string, unknown> | null;
    const vendorArr = business?.vendor as Record<string, unknown>[] | null;
    const vendor = vendorArr?.[0];
    return { ...(p as unknown as Product), vendor: vendor ? { business_name: vendor.business_name as string, business_slug: vendor.business_slug as string, logo_url: vendor.logo_url as string | null } : undefined };
  });

  return { products, total: count || 0 };
}

// ============================================================
// Product / Service Detail
// ============================================================

export async function getProductById(id: string): Promise<Product | null> {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .eq('is_archived', false)
    .maybeSingle();
  return data as Product | null;
}

export async function getServiceById(id: string): Promise<Service | null> {
  const { data } = await supabase
    .from('services')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .eq('is_archived', false)
    .maybeSingle();
  return data as Service | null;
}

export async function getSimilarProducts(productId: string, businessId: string, limit = 4): Promise<Product[]> {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('is_archived', false)
    .neq('id', productId)
    .gt('stock', 0)
    .limit(limit);

  return (data || []) as Product[];
}

export async function getRelatedServices(businessId: string, excludeId: string, limit = 4): Promise<Service[]> {
  const { data } = await supabase
    .from('services')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('is_archived', false)
    .neq('id', excludeId)
    .limit(limit);

  return (data || []) as Service[];
}

// ============================================================
// Checkout & Order Creation
// ============================================================

export async function createOrder(params: {
  items: {
    product_id?: string;
    service_id?: string;
    quantity: number;
    booking_date?: string;
    booking_time?: string;
    booking_notes?: string;
  }[];
  delivery_method: DeliveryMethod;
  delivery_address?: DeliveryAddress;
  delivery_instructions?: string;
  notes?: string;
  coupon_code?: string;
  idempotency_key?: string;
}): Promise<{ data: Order | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_marketplace_checkout', {
    p_items: params.items,
    p_delivery_method: params.delivery_method,
    p_delivery_address: params.delivery_address || null,
    p_delivery_instructions: params.delivery_instructions || null,
    p_coupon_code: params.coupon_code || null,
    p_notes: params.notes || null,
    p_idempotency_key: params.idempotency_key || null,
  });
  if (error) return { data: null, error: error.message };
  const checkout = data as { order?: Order } | null;
  return {
    data: checkout?.order || null,
    error: checkout?.order ? null : 'Checkout did not create an order',
  };
}

export async function clearCartItems(): Promise<void> {
  const cart = await getOrCreateCart();
  if (!cart) return;

  await supabase
    .from('cart_items')
    .delete()
    .eq('cart_id', cart.id);
}

// ============================================================
// Order Management (Student)
// ============================================================

export async function getStudentOrders(status?: OrderStatus): Promise<OrderWithDetails[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('orders')
    .select(`
      *,
      items:order_items(
        *,
        product:products(id, name, slug, image_url),
        service:services(id, name, slug, image_url)
      ),
      vendor:vendors(id, business_name, business_slug, logo_url, contact_phone, whatsapp_number, owner_id),
      buyer:profiles!orders_buyer_id_fkey(id, full_name, avatar_url, email)
    `)
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data } = await query;
  return (data || []) as unknown as OrderWithDetails[];
}

export async function getOrderById(orderId: string): Promise<OrderWithDetails | null> {
  const { data } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(
        *,
        product:products(id, name, slug, image_url),
        service:services(id, name, slug, image_url)
      ),
      vendor:vendors(id, business_name, business_slug, logo_url, contact_phone, whatsapp_number, owner_id),
      buyer:profiles!orders_buyer_id_fkey(id, full_name, avatar_url, email)
    `)
    .eq('id', orderId)
    .maybeSingle();

  return data as unknown as OrderWithDetails | null;
}

export async function getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
  const { data } = await supabase
    .from('order_status_history')
    .select(`
      *,
      changed_by_profile:profiles!order_status_history_changed_by_fkey(full_name, avatar_url)
    `)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  return (data || []) as unknown as OrderStatusHistory[];
}

export async function cancelOrder(orderId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('customer_cancel_order', {
    p_order_id: orderId,
    p_reason: reason || null,
  });
  return { error: error?.message || null };
}

// ============================================================
// Order Management (Vendor)
// ============================================================

export async function getVendorOrders(status?: OrderStatus): Promise<OrderWithDetails[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get vendor IDs owned by this user
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id')
    .eq('owner_id', user.id);

  if (!vendors || vendors.length === 0) return [];

  const vendorIds = vendors.map(v => v.id);

  let query = supabase
    .from('orders')
    .select(`
      *,
      items:order_items(
        *,
        product:products(id, name, slug, image_url),
        service:services(id, name, slug, image_url)
      ),
      vendor:vendors(id, business_name, business_slug, logo_url, contact_phone, whatsapp_number, owner_id),
      buyer:profiles!orders_buyer_id_fkey(id, full_name, avatar_url, email)
    `)
    .in('vendor_id', vendorIds)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data } = await query;
  return (data || []) as unknown as OrderWithDetails[];
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  note?: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('vendor_transition_order', {
    p_order_id: orderId,
    p_next_status: newStatus,
    p_note: note || null,
  });
  return { error: error?.message || null };

  /*

  // Get current order to check ownership and previous status
  const { data: order } = await supabase
    .from('orders')
    .select('status, vendor_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return { error: 'Order not found' };

  // Verify vendor ownership
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('id', order.vendor_id)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!vendor) return { error: 'Not authorized' };

  const updates: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'accepted') updates.accepted_at = new Date().toISOString();
  if (newStatus === 'completed') updates.completed_at = new Date().toISOString();
  if (newStatus === 'cancelled') {
    updates.cancelled_at = new Date().toISOString();
    updates.cancellation_reason = note || 'Cancelled by vendor';
  }

  void updates;

  // Notify buyer
  const { data: orderDetails } = await supabase
    .from('orders')
    .select('buyer_id, order_number')
    .eq('id', orderId)
    .maybeSingle();

  if (orderDetails) {
    await supabase
      .from('notifications')
      .insert({
        user_id: orderDetails.buyer_id,
        type: 'order_status_update',
        title: `Order ${orderDetails.order_number} — ${newStatus}`,
        body: note || `Your order status has been updated to: ${newStatus}`,
        link: `/orders/${orderId}`,
      });
  }

  return { error: null }; */
}

export async function rejectOrder(orderId: string, reason: string): Promise<{ error: string | null }> {
  return updateOrderStatus(orderId, 'cancelled', reason);
}

export async function updateVendorOrderNotes(orderId: string, notes: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('vendor_update_order_notes', { p_order_id: orderId, p_notes: notes });
  return { error: error?.message || null };
}

// ============================================================
// Service Booking
// ============================================================

export async function updateBookingStatus(
  orderItemId: string,
  status: 'confirmed' | 'rescheduled' | 'declined',
  rescheduledTo?: string
): Promise<{ error: string | null }> {
  void rescheduledTo;
  if (status === 'rescheduled') return { error: 'Booking rescheduling is not yet supported by the secure workflow.' };
  const { error } = await supabase.rpc('vendor_update_booking_status', { p_order_item_id: orderItemId, p_status: status });
  return { error: error?.message || null };
}

// ============================================================
// Receipts
// ============================================================

export async function getReceipt(orderId: string): Promise<Receipt | null> {
  const { data } = await supabase
    .from('receipts')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();
  return data as Receipt | null;
}

export async function generateReceipt(orderId: string): Promise<{ data: Receipt | null; error: string | null }> {
  const existing = await getReceipt(orderId);
  if (existing) return { data: existing, error: null };
  return {
    data: null,
    error: 'A receipt is issued only after verified payment confirmation.',
  };
}

// ============================================================
// Wishlist
// ============================================================

export async function getWishlist(): Promise<(WishlistItem & { product?: Product; service?: Service })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('wishlists')
    .select(`
      *,
      product:products(*),
      service:services(*)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (data || []) as unknown as (WishlistItem & { product?: Product; service?: Service })[];
}

export async function addToWishlist(itemType: 'product' | 'service', itemId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('wishlists')
    .insert({
      user_id: user.id,
      item_type: itemType,
      item_id: itemId,
    });
  return { error: error?.message || null };
}

export async function removeFromWishlist(itemType: 'product' | 'service', itemId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', user.id)
    .eq('item_type', itemType)
    .eq('item_id', itemId);
  return { error: error?.message || null };
}

export async function isInWishlist(itemType: 'product' | 'service', itemId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('item_type', itemType)
    .eq('item_id', itemId)
    .maybeSingle();

  return !!data;
}

// ============================================================
// Coupons
// ============================================================

export async function validateCoupon(code: string, orderAmount: number): Promise<{ valid: boolean; coupon?: Coupon; discount?: number; error?: string }> {
  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .maybeSingle();

  if (!coupon) return { valid: false, error: 'Invalid coupon code' };

  const now = new Date();
  if (new Date(coupon.starts_at) > now || new Date(coupon.ends_at) < now) {
    return { valid: false, error: 'This coupon has expired' };
  }

  if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
    return { valid: false, error: 'This coupon has reached its usage limit' };
  }

  if (orderAmount < coupon.min_order_amount) {
    return { valid: false, error: `Minimum order amount is GH₵${coupon.min_order_amount}` };
  }

  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = (orderAmount * coupon.discount_value) / 100;
    if (coupon.max_discount_amount) {
      discount = Math.min(discount, coupon.max_discount_amount);
    }
  } else {
    discount = coupon.discount_value;
  }

  return { valid: true, coupon: coupon as Coupon, discount };
}

export async function redeemCoupon(couponId: string, orderId: string): Promise<{ error: string | null }> {
  void couponId;
  void orderId;
  return { error: 'Coupons are redeemed only during the authoritative checkout workflow.' };
}

// ============================================================
// Order Messages
// ============================================================

export async function getOrderMessages(orderId: string): Promise<OrderMessage[]> {
  const { data } = await supabase
    .from('order_messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  return (data || []) as OrderMessage[];
}

export async function sendOrderMessage(
  orderId: string,
  recipientId: string,
  body: string
): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('order_messages')
    .insert({
      order_id: orderId,
      sender_id: user.id,
      recipient_id: recipientId,
      body,
    });

  return { error: error?.message || null };
}

export async function markOrderMessagesRead(orderId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('order_messages')
    .update({ is_read: true })
    .eq('order_id', orderId)
    .eq('recipient_id', user.id)
    .eq('is_read', false);
}

// ============================================================
// Marketplace Reviews (Verified Purchase)
// ============================================================

export async function hasPurchasedProduct(productId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { count } = await supabase
    .from('orders')
    .select(`
      id!inner,
      items:order_items!inner(product_id)
    `, { count: 'exact', head: true })
    .eq('buyer_id', user.id)
    .in('status', ['completed', 'fulfilled']);

  return (count || 0) > 0;
}

export async function hasCompletedService(serviceId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('orders')
    .select(`
      id,
      items:order_items(service_id, booking_status)
    `)
    .eq('buyer_id', user.id)
    .in('status', ['completed', 'fulfilled']);

  if (!data) return false;

  for (const order of data) {
    const items = order.items as unknown as Array<{ service_id: string | null; booking_status: string | null }>;
    if (items?.some(i => i.service_id === serviceId)) return true;
  }

  return false;
}

export async function createMarketplaceReview(params: {
  vendor_id: string;
  product_id?: string;
  service_id?: string;
  rating: number;
  comment?: string;
}): Promise<{ error: string | null }> {
  void params.vendor_id;
  const target = params.product_id ? { type: 'product', id: params.product_id }
    : params.service_id ? { type: 'service', id: params.service_id } : null;
  if (!target) return { error: 'Select a purchased product or completed service to review.' };
  const { error } = await supabase.rpc('create_verified_review', {
    p_target_type: target.type,
    p_target_id: target.id,
    p_rating: params.rating,
    p_comment: params.comment || null,
  });

  return { error: error?.message || null };
}
