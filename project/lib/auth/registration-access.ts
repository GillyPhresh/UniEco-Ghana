import { withNext } from './redirects';

// 'student' is the existing paid student lane (including old referral links).
export type RegistrationIntent = 'buyer' | 'student' | 'external_vendor';
export type RegistrationPath = '/onboarding/buyer' | '/onboarding/student' | '/onboarding/vendor';
export type PaystackPurpose = 'student_registration' | 'vendor_registration' | 'marketplace' | 'subscription';

export type RegistrationAccess = {
  allowed: boolean;
  role: string | null;
  status: string;
  registration_path: RegistrationPath | null;
  buyer_restricted: boolean;
  seller_upgrade_started: boolean;
  can_paystack: boolean;
  can_pay_student_registration: boolean;
  can_pay_vendor_registration: boolean;
  can_publish: boolean;
  can_student_referral: boolean;
  can_vendor_referral: boolean;
  student_business_covered: boolean;
  required_amount: number | null;
  student_fee: number | null;
  vendor_fee: number | null;
};

export function readRegistrationIntent(value: unknown): RegistrationIntent | null {
  return value === 'buyer' || value === 'student' || value === 'external_vendor' ? value : null;
}

export function signupReferralCode(value: string | null, intent: RegistrationIntent | null) {
  const code = value?.trim().toUpperCase();
  if (!code) return null;
  if (intent === 'student' && /^UE-[A-F0-9]{20}$/.test(code)) return code;
  if (intent === 'external_vendor' && /^UEV-[A-F0-9]{20}$/.test(code)) return code;
  return null;
}

export function canInitializePaystack(access: RegistrationAccess | null, purpose: PaystackPurpose) {
  if (!access) return false;
  if (purpose === 'student_registration') return access.can_pay_student_registration
    && (!access.buyer_restricted || access.seller_upgrade_started);
  if (purpose === 'vendor_registration') return access.can_pay_vendor_registration
    && (!access.buyer_restricted || access.seller_upgrade_started);
  return !access.buyer_restricted && access.can_paystack;
}

export function parseRegistrationAccess(value: unknown): RegistrationAccess | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<RegistrationAccess>;
  if (typeof data.allowed !== 'boolean' || typeof data.status !== 'string'
      || typeof data.buyer_restricted !== 'boolean') return null;
  return {
    allowed: data.allowed,
    role: typeof data.role === 'string' ? data.role : null,
    status: data.status,
    registration_path: data.registration_path === '/onboarding/buyer' ||
      data.registration_path === '/onboarding/student' || data.registration_path === '/onboarding/vendor'
      ? data.registration_path : null,
    buyer_restricted: data.buyer_restricted,
    seller_upgrade_started: data.seller_upgrade_started === true,
    can_paystack: data.can_paystack === true,
    can_pay_student_registration: data.can_pay_student_registration === true,
    can_pay_vendor_registration: data.can_pay_vendor_registration === true,
    can_publish: data.can_publish === true,
    can_student_referral: data.can_student_referral === true,
    can_vendor_referral: data.can_vendor_referral === true,
    student_business_covered: data.student_business_covered === true,
    required_amount: money(data.required_amount),
    student_fee: money(data.student_fee),
    vendor_fee: money(data.vendor_fee),
  };
}

function money(amount: unknown): number | null {
  return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function registrationFeeLabel(amount: number | null | undefined) {
  return amount == null ? null : `GH₵${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function registrationDestination(access: RegistrationAccess | null, next?: string | null) {
  return withNext(access?.registration_path ?? '/onboarding', next);
}

export const SELLER_UPGRADE_PATH = '/onboarding/upgrade';
