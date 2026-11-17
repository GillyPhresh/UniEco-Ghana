'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Phone, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/auth-context';
import { courierGateway } from '@/lib/data/courier-client';
import { JOB_LABELS, PARCEL_SIZES, normalizeCourierPhone, type CourierJobState, type CourierTracking, type ParcelSize } from '@/lib/courier/domain';

export function CourierOrderPanel({ orderId, onStage }: { orderId: string; onStage?: (stage: CourierJobState | null) => void }) {
  const { user } = useAuth();
  const query = useQuery<CourierTracking | null>({
    queryKey: ['courier-tracking', user?.id, orderId],
    queryFn: () => courierGateway.tracking(orderId),
    enabled: Boolean(user?.id && orderId),
    refetchInterval: 20_000,
    staleTime: 8000,
  });
  const tracking: CourierTracking | null = query.data ?? null;
  const stage = tracking?.state ?? null;
  useEffect(() => { onStage?.(stage); }, [stage, onStage]);
  if (!user || !tracking || (!tracking.open && !tracking.state && !tracking.authorized)) return null;
  return <OrderPanel key={`${user.id}:${orderId}`} orderId={orderId} tracking={tracking} reload={query.refetch} />;
}

function OrderPanel({ orderId, tracking, reload }: { orderId: string; tracking: CourierTracking; reload: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pickup, setPickup] = useState('');
  const [parcel, setParcel] = useState<ParcelSize>('small');
  const [ready, setReady] = useState(false);
  const lock = useRef(false);
  const stage = tracking.state;
  const contact = tracking.contact;
  const phone = contact ? normalizeCourierPhone(contact.phone) : null;

  async function act(action: () => Promise<unknown>, success: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await action();
      await reload();
      setNotice(success);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update the delivery.'); }
    finally { lock.current = false; setBusy(false); }
  }

  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pickup.trim().length < 5) return;
    void act(async () => {
      await courierGateway.request(orderId, pickup.trim(), parcel, ready);
      setPickup('');
      setReady(false);
    }, 'Courier request sent to UniEco operations.');
  }

  return <section className="space-y-3 rounded-xl border border-border bg-card p-3.5" aria-label="Courier tracking">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Truck className="h-4 w-4 text-primary" aria-hidden="true" /> UniEco courier</h3>
      {stage && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{JOB_LABELS[stage]}</span>}
    </div>
    {contact && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <span>Courier: <strong>{contact.name}</strong></span>
      {phone && <a href={`tel:${phone}`} className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary"><Phone className="h-4 w-4" aria-hidden="true" /> Call</a>}
    </div>}
    {tracking.handoff_code && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" aria-hidden="true" /> {tracking.role === 'shop' ? 'Pickup code' : 'Drop-off code'}</p>
      <p className="mt-1 break-all font-mono text-2xl font-black tracking-[.24em]">{tracking.handoff_code}</p>
      <p className="mt-1 text-xs text-muted-foreground">Share this only when the courier hands over or collects the parcel.</p>
    </div>}
    {tracking.role === 'buyer' && tracking.can_authorize && <div className="space-y-2">
      {tracking.authorized
        ? <p className="text-xs text-muted-foreground">You allowed an approved courier. The shop can now request one.</p>
        : <p className="text-xs text-muted-foreground">Allow an approved courier to receive your drop-off address for this order. No change to your order price.</p>}
      <Button type="button" variant={tracking.authorized ? 'outline' : 'default'} disabled={busy} className="min-h-[44px]"
        onClick={() => void act(() => courierGateway.authorize(orderId, !tracking.authorized), tracking.authorized ? 'Courier permission withdrawn.' : 'Courier permission saved.')}>
        {tracking.authorized ? 'Withdraw permission' : 'Allow courier delivery'}
      </Button>
    </div>}
    {tracking.role === 'shop' && tracking.can_request && <form onSubmit={request} className="space-y-3">
      <div className="space-y-1"><Label htmlFor={`pickup-${orderId}`}>Pickup address</Label>
        <Input id={`pickup-${orderId}`} value={pickup} required minLength={5} maxLength={240} onChange={event => setPickup(event.target.value)} className="min-h-[44px]" placeholder="Shop or pickup point" />
      </div>
      <div className="space-y-1"><Label htmlFor={`size-${orderId}`}>Parcel size</Label>
        <select id={`size-${orderId}`} className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm" value={parcel} onChange={event => setParcel(event.target.value as ParcelSize)}>
          {(Object.keys(PARCEL_SIZES) as ParcelSize[]).map(size => <option key={size} value={size}>{PARCEL_SIZES[size]}</option>)}
        </select>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" required checked={ready} onChange={event => setReady(event.target.checked)} className="mt-0.5" /><span>The parcel is ready. The shop handles payment directly with the buyer; the courier does not collect it.</span></label>
      <Button type="submit" disabled={busy || !ready} className="min-h-[44px]">Request courier</Button>
    </form>}
    {tracking.role === 'shop' && (stage === 'requested' || stage === 'offered') && <Button type="button" variant="outline" className="min-h-[44px]" disabled={busy}
      onClick={() => void act(() => courierGateway.withdraw(orderId), 'Courier request withdrawn. Your order is unchanged.')}>Withdraw request</Button>}
    {tracking.role === 'shop' && tracking.open && !tracking.authorized && !stage && <p className="text-xs text-muted-foreground">The buyer must allow a courier from their order first.</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
  </section>;
}
