'use client';

import { supabase } from '@/lib/supabase/client';
import { normalizeSearchTerm } from '@/lib/utils/search';
import type { Subscription } from '@/lib/types';
import type {
  PaymentRecord, PaymentProvider, Invoice, InvoiceItem,
  AdminPayment, AdminInvoice, Coupon,
  Receipt, AdminRefund, TransactionAuditEntry, PaymentStatusEvent,
  VendorFinancialSummary, AdminFinancialSummary,
} from '@/lib/types/payment';

export async function startPaystackCheckout(input: {
  purpose: 'subscription' | 'marketplace' | 'student_registration';
  vendorId?: string;
  orderId?: string;
  idempotencyKey: string;
  autoRenew?: boolean;
  registration?: {
    universityId: string;
    phone: string;
    studentIdNumber?: string | null;
    program?: string | null;
    faculty?: string | null;
    department?: string | null;
    level: string;
    admissionYear: number;
    graduationYear?: number | null;
    studentDocumentPath?: string | null;
    referralCode?: string | null;
  };
}): Promise<{ authorizationUrl: string | null; reference: string | null; error: string | null; alreadyPaid?: boolean }> {
  try {
    const response = await fetch('/api/payments/paystack/initialize', {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const responseText = await response.text();
    let payload: { authorizationUrl?: string; reference?: string; error?: string; alreadyPaid?: boolean } = {};
    try {
      payload = JSON.parse(responseText) as typeof payload;
    } catch {
      // Reverse proxies sometimes return an HTML error document for API routes.
      // Keep that implementation detail away from users and show a useful retry.
    }
    return response.ok && payload.reference && (payload.authorizationUrl || payload.alreadyPaid)
      ? { authorizationUrl: payload.authorizationUrl || null, reference: payload.reference, error: null, alreadyPaid: payload.alreadyPaid === true }
      : { authorizationUrl: null, reference: null, error: payload.error || 'Payment checkout could not be started. Please try again.' };
  } catch (error) {
    return {
      authorizationUrl: null,
      reference: null,
      error: error instanceof DOMException && error.name === 'TimeoutError'
        ? 'Payment checkout is taking too long. Please try again.'
        : 'Could not connect to payment checkout. Check your connection and try again.',
    };
  }
}

// ============================================================
// Payment Providers
// ============================================================
export async function getEnabledPaymentProviders(): Promise<PaymentProvider[]> {
  const { data } = await supabase
    .from('payment_providers')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });
  return (data || []) as PaymentProvider[];
}

export async function getAllPaymentProviders(): Promise<PaymentProvider[]> {
  const { data } = await supabase
    .from('payment_providers')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data || []) as PaymentProvider[];
}

export async function togglePaymentProvider(id: string, enabled: boolean): Promise<{ error: string | null }> {
  void id;
  void enabled;
  return { error: 'Payment provider configuration is disabled until a trusted administrator workflow is implemented.' };
}

// ============================================================
// Payment intents — request-only browser APIs
// The database calculates amount, plan, ownership, and state.
// ============================================================
export async function initiateSubscriptionPayment(params: {
  vendorId: string;
  provider: string;
  mobileNumber?: string;
  mobileNetwork?: string;
  autoRenew?: boolean;
  idempotencyKey?: string;
}): Promise<{ payment: PaymentRecord | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_subscription_payment_intent', {
    p_vendor_id: params.vendorId,
    p_provider: params.provider,
    p_mobile_number: params.mobileNumber || null,
    p_mobile_network: params.mobileNetwork || null,
    p_auto_renew: params.autoRenew ?? false,
    p_idempotency_key: params.idempotencyKey || null,
  });

  if (error) return { payment: null, error: 'Unable to start subscription payment. Please try again.' };
  return { payment: data as unknown as PaymentRecord, error: null };
}

// ============================================================
// Payments — User History
// ============================================================
export async function getUserPayments(params: {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
  paymentType?: string;
}): Promise<{ payments: PaymentRecord[]; total: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { payments: [], total: 0 };

  const limit = Math.min(100, Math.max(1, Math.trunc(params.limit || 20)));
  const offset = Math.min(10000, Math.max(0, Math.trunc(params.offset || 0)));

  let query = supabase
    .from('payments')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.paymentType && params.paymentType !== 'all') query = query.eq('payment_type', params.paymentType);
  const search = normalizeSearchTerm(params.search || '');
  if (search) {
    query = query.or(`payment_reference.ilike.%${search}%,provider_reference.ilike.%${search}%`);
  }

  const { data, count } = await query;
  return { payments: (data || []) as unknown as PaymentRecord[], total: count || 0 };
}

// ============================================================
// Payments — Admin
// ============================================================
export async function getAdminPayments(params: {
  status?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}): Promise<{ payments: AdminPayment[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_payment_directory', {
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_limit: params.limit || 20,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load authorized payments');
  const rows = (data || []) as Array<{
    id: string; payment_reference: string | null; provider: string | null; payment_type: string;
    amount: number; currency: string; status: string; created_at: string;
    user_full_name: string | null; user_email: string | null; total_count: number;
  }>;
  return {
    payments: rows.map(row => ({
      id: row.id, payment_reference: row.payment_reference, provider: row.provider,
      payment_type: row.payment_type, amount: Number(row.amount), currency: row.currency,
      status: row.status, created_at: row.created_at,
      user: row.user_email ? { full_name: row.user_full_name, email: row.user_email } : null,
    })),
    total: rows[0]?.total_count || 0,
  };
}

export async function getCurrentSubscription(vendorId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as Subscription | null;
}

export async function cancelSubscription(subId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_subscription_auto_renew', {
    p_subscription_id: subId,
    p_auto_renew: false,
  });
  return { error: error ? 'Unable to update subscription renewal settings.' : null };
}

export async function reactivateSubscription(subId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_subscription_auto_renew', {
    p_subscription_id: subId,
    p_auto_renew: true,
  });
  return { error: error ? 'Unable to update subscription renewal settings.' : null };
}

// ============================================================
// Invoices
// ============================================================
export async function getUserInvoices(): Promise<Invoice[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('invoices')
    .select(`
      *,
      items:invoice_items(*),
      vendor:vendors(business_name)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (data || []) as unknown as Invoice[];
}

export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const { data } = await supabase
    .from('invoices')
    .select(`
      *,
      items:invoice_items(*),
      vendor:vendors(business_name)
    `)
    .eq('id', invoiceId)
    .maybeSingle();
  return data as unknown as Invoice | null;
}

export async function getAdminInvoices(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ invoices: AdminInvoice[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_invoice_directory', {
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_limit: params.limit || 20,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load authorized invoices');
  const rows = (data || []) as Array<{
    id: string; invoice_number: string; vendor_id: string | null; invoice_type: string; amount: number;
    currency: string; tax_amount: number; total_amount: number; status: string; created_at: string;
    user_full_name: string | null; user_email: string | null; vendor_business_name: string | null; total_count: number;
  }>;
  return {
    invoices: rows.map(row => ({
      id: row.id, invoice_number: row.invoice_number, vendor_id: row.vendor_id, invoice_type: row.invoice_type,
      amount: Number(row.amount), currency: row.currency, tax_amount: Number(row.tax_amount),
      total_amount: Number(row.total_amount), status: row.status, created_at: row.created_at,
      user: row.user_email ? { full_name: row.user_full_name, email: row.user_email } : null,
      vendor: row.vendor_business_name ? { business_name: row.vendor_business_name } : null,
    })),
    total: rows[0]?.total_count || 0,
  };
}

// ============================================================
// Coupons (admin management — table already exists from marketplace migration)
// ============================================================
export async function getAdminCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase.rpc('get_admin_coupons', { p_limit: 100, p_offset: 0 });
  if (error) throw new Error('Unable to load coupons');
  return (data || []) as unknown as Coupon[];
}

export async function createCoupon(data: {
  code: string;
  description?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number;
  student_only?: boolean;
  usage_limit?: number;
  per_user_limit?: number;
  starts_at?: string;
  ends_at?: string;
  is_active?: boolean;
}, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_create_coupon', {
    p_code: data.code,
    p_description: data.description || null,
    p_discount_type: data.discount_type,
    p_discount_value: data.discount_value,
    p_min_order_amount: data.min_order_amount ?? 0,
    p_max_discount_amount: data.max_discount_amount ?? null,
    p_student_only: data.student_only ?? false,
    p_usage_limit: data.usage_limit ?? null,
    p_per_user_limit: data.per_user_limit ?? 1,
    p_is_active: data.is_active ?? true,
    p_reason: reason,
  });
  return { error: error ? 'Unable to create coupon. Verify the discount, limits, reason, and code uniqueness.' : null };
}

export async function updateCoupon(id: string, data: {
  code: string;
  description?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number | null;
  student_only?: boolean;
  usage_limit?: number | null;
  per_user_limit?: number;
  is_active?: boolean;
}, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_update_coupon', {
    p_coupon_id: id,
    p_code: data.code,
    p_description: data.description || null,
    p_discount_type: data.discount_type,
    p_discount_value: data.discount_value,
    p_min_order_amount: data.min_order_amount ?? 0,
    p_max_discount_amount: data.max_discount_amount ?? null,
    p_student_only: data.student_only ?? false,
    p_usage_limit: data.usage_limit ?? null,
    p_per_user_limit: data.per_user_limit ?? 1,
    p_is_active: data.is_active ?? true,
    p_reason: reason,
  });
  return { error: error ? 'Unable to update coupon. Verify the discount, limits, reason, and code uniqueness.' : null };
}

// ============================================================
// Wallet (future-ready — read only for now)
// ============================================================
// ============================================================
// Revenue Stats (admin)
// ============================================================
export async function getRevenueStats(): Promise<AdminFinancialSummary> {
  const { data, error } = await supabase.rpc('get_admin_financial_summary');
  if (error || !data || typeof data !== 'object') {
    // Do not turn authorization/query failures into plausible-looking zeroes.
    throw new Error('Unable to load authorized financial summary.');
  }
  return data as AdminFinancialSummary;
}

// ============================================================
// Export
// ============================================================
export function exportToCsv(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const val = row[header];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// Invoice PDF generation (client-side text-based printable)
// ============================================================
export function generateInvoicePrintable(invoice: Invoice): string {
  const items = invoice.items || [];
  const itemRows = items.map(item => `
    <tr>
      <td>${item.description}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">GH₵${item.unit_price.toFixed(2)}</td>
      <td style="text-align:right">GH₵${item.total_price.toFixed(2)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${invoice.invoice_number}</title>
<style>
  body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
  .invoice-meta { text-align: right; font-size: 14px; }
  .invoice-meta h2 { margin: 0 0 8px 0; font-size: 28px; }
  .bill-to { margin-bottom: 30px; }
  .bill-to h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { text-align: left; padding: 12px; background: #f8f9fa; font-size: 12px; text-transform: uppercase; color: #666; }
  td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  .totals { margin-left: auto; width: 300px; }
  .totals tr td { border: none; padding: 8px 12px; }
  .totals .total { font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a; }
  .footer { margin-top: 60px; font-size: 12px; color: #999; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">UniEco Ghana</div>
      <p style="font-size:12px;color:#666">University Ecosystem Platform</p>
    </div>
    <div class="invoice-meta">
      <h2>INVOICE</h2>
      <p><strong>${invoice.invoice_number}</strong></p>
      <p>Date: ${new Date(invoice.created_at).toLocaleDateString('en-GH')}</p>
      <p>Status: ${invoice.status.toUpperCase()}</p>
    </div>
  </div>
  <div class="bill-to">
    <h3>Bill To</h3>
    <p>${invoice.billing_name || '—'}</p>
    <p>${invoice.billing_email || ''}</p>
    <p>${invoice.billing_phone || ''}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="4" style="text-align:center">No items</td></tr>'}
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">GH₵${invoice.amount.toFixed(2)}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">GH₵${invoice.tax_amount.toFixed(2)}</td></tr>
    <tr class="total"><td>Total</td><td style="text-align:right">GH₵${invoice.total_amount.toFixed(2)}</td></tr>
  </table>
  <div class="footer">
    <p>UniEco Ghana — This is a computer-generated invoice and does not require a signature.</p>
    <p>For questions about this invoice, contact support@unieco.gh</p>
  </div>
</body>
</html>`;
}

export function printInvoice(invoice: Invoice): void {
  const html = generateInvoicePrintable(invoice);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}

// ============================================================
// Receipts
// ============================================================
export async function getUserReceipts(): Promise<Receipt[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('receipts')
    .select(`*, vendor:vendors(business_name)`)
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false });

  return (data || []) as unknown as Receipt[];
}

export function generateReceiptPrintable(receipt: Receipt): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt ${receipt.receipt_number || ''}</title>
<style>
  body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #1a1a1a; max-width: 600px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 30px; }
  .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
  .receipt-box { border: 1px solid #ddd; border-radius: 8px; padding: 24px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
  .row:last-child { border-bottom: none; }
  .label { color: #666; }
  .value { font-weight: 500; }
  .amount { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; color: #2563eb; }
  .footer { margin-top: 30px; font-size: 11px; color: #999; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">UniEco Ghana</div>
    <p style="font-size:12px;color:#666">Payment Receipt</p>
  </div>
  <div class="receipt-box">
    <div class="row"><span class="label">Receipt No.</span><span class="value">${receipt.receipt_number || '—'}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${new Date(receipt.generated_at).toLocaleDateString('en-GH')}</span></div>
    <div class="row"><span class="label">Type</span><span class="value">${receipt.receipt_type}</span></div>
    <div class="row"><span class="label">Payment Method</span><span class="value">${receipt.payment_method || '—'}</span></div>
    ${receipt.vendor?.business_name ? `<div class="row"><span class="label">Vendor</span><span class="value">${receipt.vendor.business_name}</span></div>` : ''}
    <div class="row"><span class="label">Billed To</span><span class="value">${receipt.billing_name || '—'}</span></div>
    <div class="amount">GH₵${(receipt.amount || 0).toFixed(2)}</div>
  </div>
  <div class="footer">
    <p>This is a computer-generated receipt and serves as proof of payment.</p>
    <p>UniEco Ghana — support@unieco.gh</p>
  </div>
</body>
</html>`;
}

export function printReceipt(receipt: Receipt): void {
  const html = generateReceiptPrintable(receipt);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.print();
}

// ============================================================
// Refunds
// ============================================================
export async function requestRefund(params: {
  paymentId: string;
  amount: number;
  reason: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('request_payment_refund', {
    p_payment_id: params.paymentId,
    p_amount: params.amount,
    p_reason: params.reason,
  });
  return { error: error ? 'Unable to request a refund. Check the payment and reason, then retry.' : null };
}

export async function getAdminRefunds(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ refunds: AdminRefund[]; total: number }> {
  const { data, error } = await supabase.rpc('get_admin_refund_directory', {
    p_status: params.status && params.status !== 'all' ? params.status : null,
    p_limit: params.limit || 20,
    p_offset: params.offset || 0,
  });
  if (error) throw new Error('Unable to load authorized refunds');
  const rows = (data || []) as Array<{
    id: string; refund_number: string | null; payment_id: string; user_id: string; vendor_id: string | null;
    amount: number; currency: string; reason: string | null; status: string; created_at: string;
    payment_reference: string | null; payment_amount: number; payment_status: string;
    user_full_name: string | null; user_email: string; vendor_business_name: string | null; total_count: number;
  }>;
  return {
    refunds: rows.map(row => ({
      id: row.id, refund_number: row.refund_number, payment_id: row.payment_id, user_id: row.user_id,
      vendor_id: row.vendor_id, amount: Number(row.amount), currency: row.currency, reason: row.reason,
      status: row.status, created_at: row.created_at,
      payment: { payment_reference: row.payment_reference, amount: Number(row.payment_amount), status: row.payment_status },
      user: { full_name: row.user_full_name, email: row.user_email },
      vendor: row.vendor_business_name ? { business_name: row.vendor_business_name } : null,
    })),
    total: rows[0]?.total_count || 0,
  };
}

export async function approveRefund(refundId: string, notes: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_payment_refund', {
    p_refund_id: refundId,
    p_approved: true,
    p_notes: notes,
  });
  return { error: error ? 'Unable to approve this refund. Check authority, state, and review reason.' : null };
}

export async function rejectRefund(refundId: string, notes: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('review_payment_refund', {
    p_refund_id: refundId,
    p_approved: false,
    p_notes: notes,
  });
  return { error: error ? 'Unable to reject this refund. Check authority, state, and review reason.' : null };
}

// ============================================================
// Transaction Audit Log
// ============================================================
export async function getTransactionAuditLog(paymentId: string): Promise<TransactionAuditEntry[]> {
  const { data } = await supabase
    .from('transaction_audit_log')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true });
  return (data || []) as unknown as TransactionAuditEntry[];
}

export async function getPaymentStatusHistory(paymentId: string): Promise<PaymentStatusEvent[]> {
  const { data } = await supabase
    .from('payment_status_history')
    .select('*')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true });
  return (data || []) as unknown as PaymentStatusEvent[];
}

// ============================================================
// Vendor Financial Summary
// ============================================================
export async function getVendorFinancialSummary(vendorId: string): Promise<VendorFinancialSummary> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { subscription: null, recentPayments: [], totalSpent: 0, upcomingRenewalDate: null };
  }

  const [subResult, paymentsResult] = await Promise.all([
    getCurrentSubscription(vendorId),
    supabase.from('payments')
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_type', 'subscription')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const recentPayments = (paymentsResult.data || []) as unknown as PaymentRecord[];

  const { data: allPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('user_id', user.id)
    .eq('status', 'success');

  const totalSpent = (allPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);

  let daysRemaining = 0;
  if (subResult?.ends_at) {
    daysRemaining = Math.max(0, Math.ceil((new Date(subResult.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  return {
    subscription: subResult ? {
      plan: subResult.plan,
      status: subResult.status,
      ends_at: subResult.ends_at,
      auto_renew: subResult.auto_renew || false,
      days_remaining: daysRemaining,
    } : null,
    recentPayments,
    totalSpent,
    upcomingRenewalDate: subResult?.next_billing_date || subResult?.ends_at || null,
  };
}

// ============================================================
// Marketplace Payment — Initiate payment for an order
// ============================================================
export async function initiateMarketplacePayment(params: {
  orderId: string;
  provider: string;
  mobileNumber?: string;
  mobileNetwork?: string;
  idempotencyKey?: string;
}): Promise<{ payment: PaymentRecord | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_marketplace_payment_intent', {
    p_order_id: params.orderId,
    p_provider: params.provider,
    p_mobile_number: params.mobileNumber || null,
    p_mobile_network: params.mobileNetwork || null,
    p_idempotency_key: params.idempotencyKey || null,
  });

  if (error) return { payment: null, error: 'Unable to start marketplace payment. Please try again.' };
  return { payment: data as unknown as PaymentRecord, error: null };
}

// ============================================================
// University Revenue Breakdown
// ============================================================
// ============================================================
// Payment Methods — Get available methods per provider
// ============================================================
export function getPaymentMethodsForProvider(provider: PaymentProvider): Array<{
  id: string;
  name: string;
  type: 'mobile_money' | 'card' | 'bank' | 'wallet';
  icon: string;
}> {
  const methods: Array<{ id: string; name: string; type: 'mobile_money' | 'card' | 'bank' | 'wallet'; icon: string }> = [];

  for (const method of provider.supported_methods) {
    switch (method) {
      case 'mtn_momo':
        methods.push({ id: 'mtn_momo', name: 'MTN Mobile Money', type: 'mobile_money', icon: 'phone' });
        break;
      case 'vodafone_cash':
        methods.push({ id: 'vodafone_cash', name: 'Vodafone Cash', type: 'mobile_money', icon: 'phone' });
        break;
      case 'airteltigo_money':
        methods.push({ id: 'airteltigo_money', name: 'AirtelTigo Money', type: 'mobile_money', icon: 'phone' });
        break;
      case 'visa':
        methods.push({ id: 'visa', name: 'Visa Card', type: 'card', icon: 'credit-card' });
        break;
      case 'mastercard':
        methods.push({ id: 'mastercard', name: 'Mastercard', type: 'card', icon: 'credit-card' });
        break;
      case 'bank_transfer':
        methods.push({ id: 'bank_transfer', name: 'Bank Transfer', type: 'bank', icon: 'building' });
        break;
    }
  }

  return methods;
}

// ============================================================
// Get Payment History for a specific payment (audit trail view)
// ============================================================
export async function getPaymentDetail(paymentId: string): Promise<{
  payment: PaymentRecord | null;
  auditLog: TransactionAuditEntry[];
  statusHistory: PaymentStatusEvent[];
}> {
  const [paymentResult, auditResult, historyResult] = await Promise.all([
    supabase.from('payments').select('*').eq('id', paymentId).maybeSingle(),
    getTransactionAuditLog(paymentId),
    getPaymentStatusHistory(paymentId),
  ]);

  return {
    payment: paymentResult.data as unknown as PaymentRecord | null,
    auditLog: auditResult,
    statusHistory: historyResult,
  };
}
