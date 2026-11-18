export const vendorSubscriptionPlans = {
  student_vendor: { name: 'Student Vendor', price: 20 },
  external_vendor: { name: 'Business Vendor', price: 50 },
} as const;

export type VendorSubscriptionPlan = keyof typeof vendorSubscriptionPlans;

export function vendorSubscriptionPlan(studentBusiness: boolean, role: string | null, verifiedStudent: boolean): VendorSubscriptionPlan {
  return studentBusiness && role === 'student_vendor' && verifiedStudent ? 'student_vendor' : 'external_vendor';
}

export const vendorSubscriptionPath = '/vendor-dashboard/subscription';
export const vendorSubscriptionOpenStates = ['pending', 'initiated', 'reconciliation_required'] as const;
export const vendorSubscriptionIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function vendorSubscriptionCoverage(status: string | null, endsAt: string | null, now = Date.now()) {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'active' && (!endsAt || end > now)) return 'active';
  if (status === 'expired' || (status === 'active' && end <= now)) return 'expired';
  return 'none';
}

export type VendorSubscriptionSnapshot = {
  plan: VendorSubscriptionPlan;
  price: number;
  studentBusiness: boolean;
  paystackAvailable: boolean;
  checkoutVersion: string | null;
  subscription: { status: string; ends_at: string | null; plan: string } | null;
  openPayment: { status: string; reference: string; amount: number; canResume: boolean } | null;
};
