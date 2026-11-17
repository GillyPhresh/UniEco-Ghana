export const transactionDocumentKinds = ['order-invoice', 'order-receipt', 'invoice', 'receipt'] as const;
export type TransactionDocumentKind = typeof transactionDocumentKinds[number];

export function isTransactionDocumentKind(value: string): value is TransactionDocumentKind {
  return (transactionDocumentKinds as readonly string[]).includes(value);
}

export function isDocumentId(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function transactionDocumentHref(kind: TransactionDocumentKind, id: string) {
  return `/dashboard/transactions/${kind}/${encodeURIComponent(id)}`;
}

export const receiptPaymentStatuses: ReadonlySet<string> = new Set(['success', 'refunded', 'partially_refunded']);

export const documentStatus = {
  paid: 'Payment confirmed',
  unconfirmed: 'Payment not confirmed',
  cash_unconfirmed: 'Cash payment not recorded',
  cancelled: 'Order cancelled',
  closed: 'Transaction closed · payment not confirmed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  draft: 'Draft',
  void: 'Void',
} as const;

export interface TransactionDocument {
  kind: TransactionDocumentKind;
  number: string;
  orderId?: string;
  orderNumber?: string;
  viewerSide?: 'buyer' | 'seller';
  receiptAvailable?: boolean;
  paymentId?: string | null;
  issuer: string;
  billedTo: string;
  issuedAt: string;
  dueAt?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  paymentMethod?: string | null;
  purpose?: string;
  status: keyof typeof documentStatus;
  currency: string;
  total: number | null;
  subtotal?: number | null;
  discount?: number | null;
  delivery?: number | null;
  tax?: number | null;
  items: { label: string; quantity: number; unitPrice: number; total: number }[];
}

export function documentMoney(amount: number | null | undefined, currency: string) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
  if (!/^[A-Z]{3}$/.test(currency)) return '—';
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);
}

export function documentDate(date: string) {
  const value = new Date(date);
  return Number.isNaN(value.valueOf()) ? '—' : new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium', timeZone: 'Africa/Accra',
  }).format(value);
}
