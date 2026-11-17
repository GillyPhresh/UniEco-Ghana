'use client';

import { supabase } from '@/lib/supabase/client';
import type {
  AdminCourierDashboard, CourierReviewDecision, CourierTracking, CourierVehicle, CourierWorkspace, ParcelSize,
} from '@/lib/courier/domain';

type CourierProcedure =
  | 'courier_program_is_open' | 'courier_workspace' | 'courier_apply' | 'courier_set_available' | 'courier_claim_job' | 'courier_release_job'
  | 'courier_record_handoff' | 'courier_order_tracking' | 'courier_authorize_for_order' | 'courier_request_for_order' | 'courier_shop_withdraw'
  | 'courier_admin_dashboard' | 'courier_admin_set_program' | 'courier_admin_review' | 'courier_admin_dispatch';

export class CourierProgramUnavailable extends Error {}
class CourierGateway {
  constructor(private readonly client: typeof supabase) {}

  private async call<T>(name: CourierProcedure, args?: Record<string, string | number | boolean | null>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (!error) return data as T;
    if (error.code === 'PGRST202' || error.code === '42883') throw new CourierProgramUnavailable();
    const safeProcedureCodes = ['22023', '42501', '55000'];
    throw new Error(safeProcedureCodes.includes(error.code) ? error.message : 'Courier services could not complete that request. Try again.');
  }

  async availability() {
    try { return await this.call<boolean>('courier_program_is_open'); }
    catch (error) { if (error instanceof CourierProgramUnavailable) return false; throw error; }
  }
  workspace() { return this.call<CourierWorkspace>('courier_workspace'); }
  apply(campusId: string, displayName: string, phone: string, vehicle: CourierVehicle, attested: boolean) {
    return this.call<void>('courier_apply', { p_campus_id: campusId, p_display_name: displayName, p_phone: phone, p_vehicle: vehicle, p_attested: attested });
  }
  setAvailable(available: boolean) { return this.call<void>('courier_set_available', { p_available: available }); }
  claim(orderId: string, feePesewas: number) {
    return this.call<void>('courier_claim_job', { p_order_id: orderId, p_expected_fee_pesewas: feePesewas });
  }
  release(orderId: string) { return this.call<void>('courier_release_job', { p_order_id: orderId }); }
  recordHandoff(orderId: string, code: string) {
    return this.call<{ ok: true; state: 'collected' | 'delivered' } | { ok: false; reason: 'wait' | 'code' }>(
      'courier_record_handoff', { p_order_id: orderId, p_code: code },
    );
  }
  async tracking(orderId: string) {
    try { return await this.call<CourierTracking | null>('courier_order_tracking', { p_order_id: orderId }); }
    catch (error) { if (error instanceof CourierProgramUnavailable) return null; throw error; }
  }
  authorize(orderId: string, allow: boolean) {
    return this.call<void>('courier_authorize_for_order', { p_order_id: orderId, p_allow: allow });
  }
  request(orderId: string, pickupAddress: string, parcelSize: ParcelSize, ready: boolean) {
    return this.call<void>('courier_request_for_order', {
      p_order_id: orderId, p_pickup_address: pickupAddress, p_parcel_size: parcelSize, p_ready: ready,
    });
  }
  withdraw(orderId: string) { return this.call<void>('courier_shop_withdraw', { p_order_id: orderId }); }
  adminDashboard() { return this.call<AdminCourierDashboard>('courier_admin_dashboard'); }
  setProgram(open: boolean, operationsConfirmed: boolean) {
    return this.call<void>('courier_admin_set_program', { p_open: open, p_operations_confirmed: operationsConfirmed });
  }
  review(userId: string, decision: CourierReviewDecision, verifiedUntil: string | null, checksComplete: boolean) {
    return this.call<void>('courier_admin_review', { p_user_id: userId, p_decision: decision, p_verified_until: verifiedUntil, p_checks_complete: checksComplete });
  }
  dispatch(orderId: string, action: 'publish' | 'cancel', feePesewas: number | null = null) {
    return this.call<void>('courier_admin_dispatch', { p_order_id: orderId, p_action: action, p_fee_pesewas: feePesewas });
  }
}

export const courierGateway = new CourierGateway(supabase);
