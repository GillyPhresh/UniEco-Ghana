export const COURIER_WORK_PATH = '/delivery/work';
export const COURIER_JOIN_PATH = '/delivery/join';

export const COURIER_VEHICLES = {
  walking: { title: 'On foot', short: 'Walking' },
  bicycle: { title: 'Bicycle', short: 'Bicycle' },
  motorbike: { title: 'Motorbike / okada', short: 'Motorbike' },
  car: { title: 'Car / taxi', short: 'Car / taxi' },
} as const;

export const PARCEL_SIZES = {
  small: 'Small bag',
  medium: 'Standard box',
  large: 'Large parcel · car only',
} as const;

export const JOB_LABELS = {
  requested: 'Waiting for dispatch',
  offered: 'Finding a courier',
  claimed: 'Courier assigned',
  collected: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Request withdrawn',
} as const;

export type CourierVehicle = keyof typeof COURIER_VEHICLES;
export type ParcelSize = keyof typeof PARCEL_SIZES;
export type CourierJobState = keyof typeof JOB_LABELS;
export type CourierApplicationStatus = 'pending' | 'approved' | 'declined' | 'paused';
export type CourierReviewDecision = 'approved' | 'declined' | 'paused';

export interface CourierApplication {
  display_name: string;
  phone: string;
  campus_id: string;
  vehicle: CourierVehicle;
  status: CourierApplicationStatus;
  available: boolean;
  verified_until: string | null;
}
export interface CourierOffer {
  id: string;
  campus: string;
  parcel_size: ParcelSize;
  fee_pesewas: number;
  offer_until: string;
}
export interface CourierAssignment {
  id: string;
  reference: string | null;
  state: 'claimed' | 'collected';
  campus: string;
  fee_pesewas: number;
  shop: string;
  shop_phone: string | null;
  pickup: string | null;
  dropoff: { line1: string | null; city: string | null; region: string | null; landmark: string | null } | null;
}
export interface CourierWorkspace {
  open: boolean;
  can_work: boolean;
  application: CourierApplication | null;
  offers: CourierOffer[];
  assignment: CourierAssignment | null;
}
export interface CourierTracking {
  open: boolean;
  authorized: boolean;
  state: CourierJobState | null;
  role: 'buyer' | 'shop';
  can_authorize: boolean;
  can_request: boolean;
  handoff_code: string | null;
  contact: { name: string; phone: string } | null;
}
export interface AdminCourierApplication extends Pick<CourierApplication, 'display_name' | 'phone' | 'vehicle' | 'status' | 'verified_until'> {
  id: string;
  campus: string;
}
export interface AdminCourierJob extends Pick<CourierOffer, 'id' | 'campus' | 'parcel_size'> {
  reference: string | null;
  shop: string;
  courier: string | null;
  state: CourierJobState;
  budget_pesewas: number;
  fee_pesewas: number | null;
  offer_until: string | null;
}
export interface AdminCourierDashboard {
  open: boolean;
  applications: AdminCourierApplication[];
  jobs: AdminCourierJob[];
}

export function normalizeCourierPhone(value: string): string | null {
  const number = value.trim().replace(/[\s()-]/g, '');
  const international = /^0\d{9}$/.test(number) ? '+233' + number.slice(1) : number;
  return /^\+233\d{9}$/.test(international) ? international : null;
}

export const showCourierFee = (pesewas: number) => `GH₵${(pesewas / 100).toFixed(2)}`;
export const needsMotorVerification = (vehicle: CourierVehicle) => vehicle === 'motorbike' || vehicle === 'car';

export function courierFeeChoices(budget: number) {
  if (!Number.isSafeInteger(budget) || budget < 100) return [];
  return Array.from(new Set([100, 200, 300, 500, 800, 1000, 1500, 2000, Math.min(budget, 100000)]
    .filter(amount => amount <= budget))).sort((a, b) => a - b);
}
