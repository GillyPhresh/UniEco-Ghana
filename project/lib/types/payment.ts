import type { Subscription } from '@/lib/types';

export interface PaymentRecord {
  id: string;
  order_id: string | null;
  payment_reference: string | null;
  provider: string | null;
  provider_reference: string | null;
  user_id: string | null;
  vendor_id: string | null;
  payment_type: string;
  entity_id: string | null;
  amount: number;
  currency: string;
  mobile_number: string | null;
  mobile_network: string | null;
  status: string;
  failure_reason: string | null;
  webhook_received: boolean;
  webhook_data: Record<string, unknown>;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  display_name: string;
  is_enabled: boolean;
  supported_methods: string[];
  config: Record<string, unknown>;
  sort_order: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  user_id: string;
  vendor_id: string | null;
  payment_id: string | null;
  invoice_type: string;
  entity_id: string | null;
  amount: number;
  currency: string;
  tax_amount: number;
  total_amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  billing_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  items?: InvoiceItem[];
  vendor?: { business_name: string } | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface AdminPayment extends PaymentRecord {
  user?: { full_name: string | null; email: string } | null;
  vendor?: { business_name: string } | null;
}

export interface AdminInvoice extends Invoice {
  user?: { full_name: string | null; email: string } | null;
  vendor?: { business_name: string } | null;
}

export interface Receipt {
  id: string;
  order_id: string | null;
  payment_id: string | null;
  user_id: string | null;
  vendor_id: string | null;
  receipt_number: string | null;
  receipt_type: string;
  amount: number | null;
  currency: string;
  payment_method: string | null;
  billing_name: string | null;
  billing_email: string | null;
  generated_at: string;
  data: Record<string, unknown>;
  vendor?: { business_name: string } | null;
}

export interface Refund {
  id: string;
  refund_number: string | null;
  payment_id: string;
  user_id: string;
  vendor_id: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  processed_at: string | null;
  provider_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  payment?: { payment_reference: string | null; amount: number; status: string } | null;
  user?: { full_name: string | null; email: string } | null;
  vendor?: { business_name: string } | null;
}

export interface TransactionAuditEntry {
  id: string;
  payment_id: string;
  previous_status: string | null;
  new_status: string;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PaymentStatusEvent {
  id: string;
  payment_id: string;
  status: string;
  event_type: string;
  description: string | null;
  actor_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface VendorFinancialSummary {
  subscription: {
    plan: string;
    status: string;
    ends_at: string | null;
    auto_renew: boolean;
    days_remaining: number;
  } | null;
  recentPayments: PaymentRecord[];
  totalSpent: number;
  upcomingRenewalDate: string | null;
}

export interface AdminFinancialSummary {
  totalRevenue: number;
  monthlyRevenue: number;
  dailyRevenue: number;
  subscriptionRevenue: number;
  adRevenue: number;
  marketplaceRevenue: number;
  failedPayments: number;
  outstandingPayments: number;
  pendingRefunds: number;
  monthlyData: Array<{ month: string; revenue: number }>;
  revenueByType: Array<{ type: string; revenue: number }>;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
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

export const SUBSCRIPTION_PLANS = {
  student_vendor: {
    name: 'Student Vendor',
    price: 20,
    currency: 'GHS',
    billing: 'monthly',
    features: [
      'List unlimited products and services',
      'Receive orders from students',
      'Access to vendor analytics',
      'Promotional tools',
      'Customer messaging',
    ],
  },
  external_vendor: {
    name: 'External Vendor',
    price: 50,
    currency: 'GHS',
    billing: 'monthly',
    features: [
      'Everything in Student Vendor',
      'Advanced analytics dashboard',
      'Priority listing placement',
      'Advertisement capabilities',
      'Bulk product management',
      'Dedicated support channel',
    ],
  },
} as const;

export const MOBILE_NETWORKS = [
  { id: 'mtn', name: 'MTN Mobile Money', code: 'mtn_momo' },
  { id: 'vodafone', name: 'Vodafone Cash', code: 'vodafone_cash' },
  { id: 'airteltigo', name: 'AirtelTigo Money', code: 'airteltigo_money' },
] as const;

export const PAYMENT_STATUSES = {
  pending: { label: 'Pending', color: 'bg-warning/10 text-warning' },
  initiated: { label: 'Initiated', color: 'bg-info/10 text-info' },
  success: { label: 'Successful', color: 'bg-success/10 text-success' },
  failed: { label: 'Failed', color: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground' },
  refunded: { label: 'Refunded', color: 'bg-accent/10 text-accent' },
} as const;

export const INVOICE_STATUSES = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  issued: { label: 'Issued', color: 'bg-info/10 text-info' },
  paid: { label: 'Paid', color: 'bg-success/10 text-success' },
  void: { label: 'Void', color: 'bg-destructive/10 text-destructive' },
  refunded: { label: 'Refunded', color: 'bg-accent/10 text-accent' },
} as const;

export const REFUND_STATUSES = {
  requested: { label: 'Requested', color: 'bg-warning/10 text-warning' },
  approved: { label: 'Approved', color: 'bg-info/10 text-info' },
  rejected: { label: 'Rejected', color: 'bg-destructive/10 text-destructive' },
  processed: { label: 'Processed', color: 'bg-success/10 text-success' },
  failed: { label: 'Failed', color: 'bg-destructive/10 text-destructive' },
} as const;
